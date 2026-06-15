import json
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.api.dependencies import get_current_user
from app.db.session import get_pharmacy_session, get_session
from app.models.user import User
from app.schemas.customer import CustomerAddressCreateRequest, CustomerAddressResponse
from app.schemas.customer_order import (
    CreatePharmacyOrderRequest,
    CustomerOrderActionRequest,
    CustomerPharmacyOrderResponse,
    SubstitutionPermissionRequest,
)
from app.services.customer_service import (
    create_customer_address,
    delete_customer_address,
    get_customer_address,
    list_customer_addresses,
    update_customer_address,
)
from app.services.customer_order_service import (
    APPROVED,
    CANCELLED,
    REJECTED,
    approve_price_estimate,
    create_customer_pharmacy_order,
    get_customer_order_media_file_path,
    get_customer_pharmacy_order,
    list_customer_pharmacy_orders,
    reorder_customer_pharmacy_order,
    recreate_cancelled_order_any_nearby,
    reject_price_estimate,
    save_customer_order_media,
    set_substitution_permission,
    update_customer_order_status,
)

router = APIRouter(prefix="/customer", tags=["customer"])


@router.get("/addresses", response_model=list[CustomerAddressResponse])
async def my_addresses(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await list_customer_addresses(session, current_user)


@router.post("/addresses", response_model=CustomerAddressResponse)
async def add_address(
    payload: CustomerAddressCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await create_customer_address(session, current_user, payload)


@router.get("/addresses/{address_id}", response_model=CustomerAddressResponse)
async def my_address(
    address_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await get_customer_address(session, current_user, address_id)


@router.put("/addresses/{address_id}", response_model=CustomerAddressResponse)
async def edit_address(
    address_id: UUID,
    payload: CustomerAddressCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await update_customer_address(session, current_user, address_id, payload)


@router.post("/pharmacy-orders", response_model=CustomerPharmacyOrderResponse)
async def create_pharmacy_order(
    payload: CreatePharmacyOrderRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await create_customer_pharmacy_order(session, current_user, payload)


@router.post("/pharmacy-orders/with-media", response_model=CustomerPharmacyOrderResponse)
async def create_pharmacy_order_with_media(
    payload: str = Form(...),
    prescription_files: list[UploadFile] | None = File(default=None),
    voice_note: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    try:
        order_payload = CreatePharmacyOrderRequest.model_validate(json.loads(payload))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid order payload.") from exc

    media = await save_customer_order_media(current_user, prescription_files or [], voice_note)
    order_payload.has_prescription = bool(media["prescription_files"])
    order_payload.has_voice_note = media["voice_note_file"] is not None
    return await create_customer_pharmacy_order(session, current_user, order_payload, media)


@router.get("/pharmacy-orders/media/{user_id}/{media_id}/{filename}")
async def customer_order_media(
    user_id: UUID,
    media_id: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    if current_user.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Media access denied.")
    return FileResponse(get_customer_order_media_file_path(user_id, media_id, filename))


@router.get("/pharmacy-orders", response_model=list[CustomerPharmacyOrderResponse])
async def my_pharmacy_orders(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await list_customer_pharmacy_orders(session, current_user)


@router.delete("/addresses/{address_id}", status_code=204)
async def remove_address(
    address_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await delete_customer_address(session, current_user, address_id)


@router.get("/active-order-count")
async def active_order_count(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    """Returns the number of in-progress pharmacy orders for the logged-in customer."""
    from app.services.customer_order_service import COMPLETED, CANCELLED, REJECTED
    from app.models.pharmacy_merchant import CustomerPharmacyOrder
    from sqlalchemy import select, func
    terminal = {COMPLETED, CANCELLED, REJECTED}
    result = await session.execute(
        select(func.count()).select_from(CustomerPharmacyOrder).where(
            CustomerPharmacyOrder.user_id == current_user.user_id,
            CustomerPharmacyOrder.status.notin_(terminal),
        )
    )
    return {"count": result.scalar_one()}


@router.get("/pharmacy-orders/{order_id}", response_model=CustomerPharmacyOrderResponse)
async def my_pharmacy_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await get_customer_pharmacy_order(session, current_user, order_id)


@router.post("/pharmacy-orders/{order_id}/approve", response_model=CustomerPharmacyOrderResponse)
async def approve_pharmacy_order(
    order_id: UUID,
    payload: CustomerOrderActionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await update_customer_order_status(session, current_user, order_id, APPROVED, payload)


@router.post("/pharmacy-orders/{order_id}/reject", response_model=CustomerPharmacyOrderResponse)
async def reject_pharmacy_order(
    order_id: UUID,
    payload: CustomerOrderActionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await update_customer_order_status(session, current_user, order_id, REJECTED, payload)


@router.post("/pharmacy-orders/{order_id}/cancel", response_model=CustomerPharmacyOrderResponse)
async def cancel_pharmacy_order(
    order_id: UUID,
    payload: CustomerOrderActionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await update_customer_order_status(session, current_user, order_id, CANCELLED, payload)


@router.post("/pharmacy-orders/{order_id}/reorder", response_model=CustomerPharmacyOrderResponse)
async def reorder_pharmacy_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await reorder_customer_pharmacy_order(session, current_user, order_id)


@router.post("/pharmacy-orders/{order_id}/recreate-any-nearby", response_model=CustomerPharmacyOrderResponse)
async def recreate_pharmacy_order_any_nearby(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await recreate_cancelled_order_any_nearby(session, current_user, order_id)


@router.post("/pharmacy-orders/{order_id}/approve-price", response_model=CustomerPharmacyOrderResponse)
async def approve_price(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await approve_price_estimate(session, current_user, order_id)


@router.post("/pharmacy-orders/{order_id}/reject-price", response_model=CustomerPharmacyOrderResponse)
async def reject_price(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await reject_price_estimate(session, current_user, order_id)


@router.post("/pharmacy-orders/{order_id}/substitution", response_model=CustomerPharmacyOrderResponse)
async def set_order_substitution_permission(
    order_id: UUID,
    payload: SubstitutionPermissionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    return await set_substitution_permission(session, current_user, order_id, payload)


# ── Delivery chat (customer → delivery boy) ───────────────────────────────

@router.get("/delivery-chat/{delivery_order_id}")
async def get_delivery_chat(
    delivery_order_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    from app.services.delivery_service import list_chat_messages
    return await list_chat_messages(session, delivery_order_id)


from pydantic import BaseModel as _BM

class _ChatMsg(_BM):
    message_text: str

@router.post("/delivery-chat/{delivery_order_id}/send")
async def customer_send_delivery_chat(
    delivery_order_id: UUID,
    payload: _ChatMsg,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_pharmacy_session),
):
    from app.services.delivery_service import send_chat_message
    return await send_chat_message(session, delivery_order_id, current_user.user_id, "customer", payload.message_text)


# ── Customer Disputes ─────────────────────────────────────────────────────
import uuid as _uuid
from typing import Optional as _Optional
from fastapi import File as _File, Form as _Form, UploadFile as _UploadFile

@router.get("/disputes")
async def list_customer_disputes(
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    """List disputes raised by the logged-in customer."""
    from app.services import dispute_service as dsvc
    return await dsvc.list_disputes(main_session, raised_by_id=current_user.user_id)


@router.get("/disputes/{dispute_id}")
async def get_customer_dispute(
    dispute_id: _uuid.UUID,
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    """Get a specific dispute for the logged-in customer."""
    from app.services import dispute_service as dsvc
    detail = await dsvc.get_dispute(main_session, dispute_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Dispute not found.")
    if str(detail.get("raised_by_id")) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="Not your dispute.")
    return detail


@router.post("/disputes")
async def raise_customer_dispute(
    dispute_type: str = _Form(...),
    reference_type: _Optional[str] = _Form(None),
    reference_id: _Optional[str] = _Form(None),
    description: str = _Form(...),
    image: _Optional[_UploadFile] = _File(None),
    voice_note: _Optional[_UploadFile] = _File(None),
    attachment: _Optional[_UploadFile] = _File(None),
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    """Raise a new dispute as a customer."""
    from app.services import dispute_service as dsvc
    ref_id = _uuid.UUID(reference_id) if reference_id else None
    display_name = current_user.full_name or current_user.phone_number
    result = await dsvc.raise_dispute(
        main_session,
        raised_by_app="CUSTOMER",
        raised_by_id=current_user.user_id,
        raised_by_name=display_name,
        dispute_type=dispute_type,
        reference_type=reference_type or "OTHER",
        reference_id=ref_id,
        reference_detail={},
        text_content=description,
        voice_file=voice_note,
        voice_duration_secs=None,
        image_file=image,
        attachment_file=attachment,
    )
    await main_session.commit()
    return result


@router.post("/disputes/{dispute_id}/reopen")
async def reopen_customer_dispute(
    dispute_id: _uuid.UUID,
    description: str = _Form(...),
    image: _Optional[_UploadFile] = _File(None),
    voice_note: _Optional[_UploadFile] = _File(None),
    attachment: _Optional[_UploadFile] = _File(None),
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    """Reopen a resolved dispute as a customer."""
    from app.services import dispute_service as dsvc
    display_name = current_user.full_name or current_user.phone_number
    result = await dsvc.reopen_dispute(
        main_session,
        dispute_id,
        raised_by_id=current_user.user_id,
        raised_by_name=display_name,
        raised_by_app="CUSTOMER",
        text_content=description,
        voice_file=voice_note,
        voice_duration_secs=None,
        image_file=image,
        attachment_file=attachment,
    )
    await main_session.commit()
    return result


# ── Order Disputes (customer) ─────────────────────────────────────────────────

import uuid as _cuuid
from typing import Optional as _COpt
from fastapi import File as _CFile, Form as _CForm, UploadFile as _CUpload


@router.post("/order-disputes", status_code=201)
async def customer_raise_order_dispute(
    source_order_id: str = _CForm(...),
    tagged_sectors: str = _CForm("pharmacy"),
    text_content: _COpt[str] = _CForm(None),
    voice_duration_secs: _COpt[int] = _CForm(None),
    voice_file: _COpt[_CUpload] = _CFile(None),
    image_file: _COpt[_CUpload] = _CFile(None),
    attachment_file: _COpt[_CUpload] = _CFile(None),
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    from app.services import dispute_service as dsvc
    sectors = [s.strip() for s in tagged_sectors.split(",") if s.strip()]
    return await dsvc.user_raise_order_dispute(
        main_session,
        raised_by_app="CUSTOMER",
        raised_by_id=current_user.user_id,
        raised_by_name=current_user.full_name or current_user.phone_number,
        source_order_id=_cuuid.UUID(source_order_id),
        tagged_sectors=sectors,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await main_session.commit()
    return result


@router.get("/order-disputes/unread-count")
async def customer_dispute_unread_count(
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    from app.services import dispute_service as dsvc
    count = await dsvc.user_unread_count(main_session, current_user.user_id)
    return {"unread": count}


@router.get("/order-disputes")
async def customer_list_order_disputes(
    status: _COpt[str] = None,
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    from app.services import dispute_service as dsvc
    return await dsvc.user_list_disputes(main_session, current_user.user_id, status=status)


@router.get("/order-disputes/{dispute_id}")
async def customer_get_order_dispute(
    dispute_id: _cuuid.UUID,
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    from app.services import dispute_service as dsvc
    await dsvc.user_mark_read(main_session, dispute_id, current_user.user_id)
    return await dsvc.get_dispute(main_session, dispute_id)


@router.post("/order-disputes/{dispute_id}/reply")
async def customer_reply_order_dispute(
    dispute_id: _cuuid.UUID,
    text_content: _COpt[str] = _CForm(None),
    voice_duration_secs: _COpt[int] = _CForm(None),
    voice_file: _COpt[_CUpload] = _CFile(None),
    image_file: _COpt[_CUpload] = _CFile(None),
    attachment_file: _COpt[_CUpload] = _CFile(None),
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    from app.services import dispute_service as dsvc
    result = await dsvc.user_reply_dispute(
        main_session, dispute_id,
        raised_by_app="CUSTOMER",
        raised_by_id=current_user.user_id,
        raised_by_name=current_user.full_name or current_user.phone_number,
        text_content=text_content,
        voice_file=voice_file,
        voice_duration_secs=voice_duration_secs,
        image_file=image_file,
        attachment_file=attachment_file,
    )
    await main_session.commit()
    return result


@router.post("/order-disputes/{dispute_id}/close")
async def customer_close_order_dispute(
    dispute_id: _cuuid.UUID,
    current_user: User = Depends(get_current_user),
    main_session: AsyncSession = Depends(get_session),
):
    from app.services import dispute_service as dsvc
    result = await dsvc.user_close_dispute(main_session, dispute_id, current_user.user_id)
    await main_session.commit()
    return result


@router.get("/attention")
async def customer_attention_items(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Items needing immediate attention on customer home page load."""
    from app.services.attention_service import get_customer_attention
    from app.db.session import PharmacySessionLocal
    async with PharmacySessionLocal() as ph_session:
        return await get_customer_attention(ph_session, current_user.user_id)
