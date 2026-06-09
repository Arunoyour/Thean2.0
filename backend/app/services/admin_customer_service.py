from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pharmacy_merchant import CustomerPharmacyOrder
from app.models.user import User, UserAddress
from app.schemas.admin_customer import (
    AdminCustomerDetailResponse,
    AdminCustomerProfileResponse,
    AdminCustomerSectorOrdersResponse,
    AdminCustomerSummaryResponse,
    AdminPharmacyOrderResponse,
)
from app.schemas.customer_order import PharmacyOrderItem
from app.services.customer_service import serialize_address


def _money_string(value: object) -> str | None:
    return str(value) if value is not None else None


def serialize_admin_customer(user: User) -> AdminCustomerProfileResponse:
    return AdminCustomerProfileResponse(
        user_id=user.user_id,
        phone_number=user.phone_number,
        email=user.email,
        full_name=user.full_name,
        wallet_balance=str(user.wallet_balance),
        is_active=user.is_active,
        created_at=user.created_at,
    )


def serialize_admin_pharmacy_order(order: CustomerPharmacyOrder) -> AdminPharmacyOrderResponse:
    return AdminPharmacyOrderResponse(
        order_id=order.order_id,
        account_id=order.account_id,
        status=order.status,
        doctor_name=order.doctor_name,
        patient_name=order.patient_name,
        pharmacy_name=order.pharmacy_name,
        pharmacy_city=order.pharmacy_city,
        pharmacy_pincode=order.pharmacy_pincode,
        estimated_amount=_money_string(order.estimated_amount),
        final_amount=_money_string(order.final_amount),
        items=[PharmacyOrderItem(**item) for item in order.order_items or []],
        notes=order.order_notes or {},
        requires_manual_review=order.requires_manual_review,
        customer_action_comment=order.customer_action_comment,
        created_at=order.created_at,
    )


async def list_admin_customers(
    core_session: AsyncSession,
    pharmacy_session: AsyncSession,
) -> list[AdminCustomerSummaryResponse]:
    users_result = await core_session.execute(select(User).order_by(User.created_at.desc()))
    users = users_result.scalars().all()
    if not users:
        return []

    user_ids = [user.user_id for user in users]

    address_count_result = await core_session.execute(
        select(UserAddress.user_id, func.count(UserAddress.address_id))
        .where(UserAddress.user_id.in_(user_ids))
        .group_by(UserAddress.user_id)
    )
    address_counts = {user_id: count for user_id, count in address_count_result.all()}

    default_address_result = await core_session.execute(
        select(UserAddress.user_id, UserAddress.label)
        .where(UserAddress.user_id.in_(user_ids))
        .where(UserAddress.is_default.is_(True))
    )
    default_addresses = {user_id: label for user_id, label in default_address_result.all()}

    pharmacy_order_result = await pharmacy_session.execute(
        select(
            CustomerPharmacyOrder.user_id,
            func.count(CustomerPharmacyOrder.order_id),
            func.max(CustomerPharmacyOrder.created_at),
        )
        .where(CustomerPharmacyOrder.user_id.in_(user_ids))
        .group_by(CustomerPharmacyOrder.user_id)
    )
    pharmacy_order_stats = {
        user_id: {"count": count, "latest": latest}
        for user_id, count, latest in pharmacy_order_result.all()
    }

    return [
        AdminCustomerSummaryResponse(
            user_id=user.user_id,
            phone_number=user.phone_number,
            email=user.email,
            full_name=user.full_name,
            wallet_balance=str(user.wallet_balance),
            is_active=user.is_active,
            created_at=user.created_at,
            default_address_label=default_addresses.get(user.user_id),
            address_count=address_counts.get(user.user_id, 0),
            pharmacy_order_count=pharmacy_order_stats.get(user.user_id, {}).get("count", 0),
            latest_pharmacy_order_at=pharmacy_order_stats.get(user.user_id, {}).get("latest"),
        )
        for user in users
    ]


async def get_admin_customer_detail(
    core_session: AsyncSession,
    pharmacy_session: AsyncSession,
    user_id: UUID,
) -> AdminCustomerDetailResponse:
    user_result = await core_session.execute(select(User).where(User.user_id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    addresses_result = await core_session.execute(
        select(UserAddress)
        .where(UserAddress.user_id == user.user_id)
        .order_by(UserAddress.is_default.desc(), UserAddress.label.asc())
    )
    pharmacy_orders_result = await pharmacy_session.execute(
        select(CustomerPharmacyOrder)
        .where(CustomerPharmacyOrder.user_id == user.user_id)
        .order_by(CustomerPharmacyOrder.created_at.desc())
    )

    return AdminCustomerDetailResponse(
        customer=serialize_admin_customer(user),
        addresses=[serialize_address(address) for address in addresses_result.scalars().all()],
        sector_orders=AdminCustomerSectorOrdersResponse(
            pharmacy=[
                serialize_admin_pharmacy_order(order)
                for order in pharmacy_orders_result.scalars().all()
            ],
            vegetables=[],
            print_shop=[],
        ),
    )
