import re
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserAddress
from app.schemas.customer import CustomerAddressCreateRequest, CustomerAddressResponse
from app.services.phone import normalize_phone_number

PINCODE_PATTERN = re.compile(r"^[1-9][0-9]{5}$")


def serialize_address(address: UserAddress) -> CustomerAddressResponse:
    return CustomerAddressResponse(
        address_id=address.address_id,
        label=address.label,
        latitude=address.latitude,
        longitude=address.longitude,
        address_line_1=address.address_line_1,
        apartment_floor_gate=address.apartment_floor_gate,
        landmark=address.landmark,
        city=address.city,
        state=address.state,
        pincode=address.pincode,
        secondary_phone_number=address.secondary_phone_number,
        location_capture_method=address.location_capture_method,
        is_default=address.is_default,
    )


async def list_customer_addresses(session: AsyncSession, user: User) -> list[CustomerAddressResponse]:
    result = await session.execute(
        select(UserAddress)
        .where(UserAddress.user_id == user.user_id)
        .order_by(UserAddress.is_default.desc(), UserAddress.label.asc())
    )
    return [serialize_address(address) for address in result.scalars().all()]


async def create_customer_address(
    session: AsyncSession,
    user: User,
    payload: CustomerAddressCreateRequest,
) -> CustomerAddressResponse:
    pincode = payload.pincode.strip()
    if not PINCODE_PATTERN.fullmatch(pincode):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid 6 digit pincode.",
        )

    secondary_phone = None
    if payload.secondary_phone_number:
        secondary_phone = normalize_phone_number(payload.secondary_phone_number)
        if secondary_phone == user.phone_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Secondary number cannot be your registered mobile number.",
            )

    address_count_result = await session.execute(
        select(func.count()).select_from(UserAddress).where(UserAddress.user_id == user.user_id)
    )
    is_first_address = address_count_result.scalar_one() == 0
    should_be_default = payload.is_default or is_first_address

    if should_be_default:
        await session.execute(
            update(UserAddress)
            .where(UserAddress.user_id == user.user_id)
            .values(is_default=False)
        )

    address = UserAddress(
        user_id=user.user_id,
        label=payload.label.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        address_line_1=payload.address_line_1.strip(),
        apartment_floor_gate=payload.apartment_floor_gate.strip() if payload.apartment_floor_gate else None,
        landmark=payload.landmark.strip(),
        city=payload.city.strip() if payload.city else None,
        state=payload.state.strip() if payload.state else None,
        pincode=pincode,
        secondary_phone_number=secondary_phone,
        location_capture_method=payload.location_capture_method,
        is_default=should_be_default,
    )
    session.add(address)
    await session.commit()
    await session.refresh(address)
    return serialize_address(address)


async def get_customer_address(
    session: AsyncSession,
    user: User,
    address_id: UUID,
) -> CustomerAddressResponse:
    address = await _get_user_address(session, user, address_id)
    return serialize_address(address)


async def update_customer_address(
    session: AsyncSession,
    user: User,
    address_id: UUID,
    payload: CustomerAddressCreateRequest,
) -> CustomerAddressResponse:
    address = await _get_user_address(session, user, address_id)

    pincode = payload.pincode.strip()
    if not PINCODE_PATTERN.fullmatch(pincode):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid 6 digit pincode.",
        )

    secondary_phone = None
    if payload.secondary_phone_number:
        secondary_phone = normalize_phone_number(payload.secondary_phone_number)
        if secondary_phone == user.phone_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Secondary number cannot be your registered mobile number.",
            )

    should_be_default = payload.is_default or address.is_default
    if should_be_default:
        await session.execute(
            update(UserAddress)
            .where(UserAddress.user_id == user.user_id)
            .where(UserAddress.address_id != address.address_id)
            .values(is_default=False)
        )

    address.label = payload.label.strip()
    address.latitude = payload.latitude
    address.longitude = payload.longitude
    address.address_line_1 = payload.address_line_1.strip()
    address.apartment_floor_gate = payload.apartment_floor_gate.strip() if payload.apartment_floor_gate else None
    address.landmark = payload.landmark.strip()
    address.city = payload.city.strip() if payload.city else None
    address.state = payload.state.strip() if payload.state else None
    address.pincode = pincode
    address.secondary_phone_number = secondary_phone
    address.location_capture_method = payload.location_capture_method
    address.is_default = should_be_default

    await session.commit()
    await session.refresh(address)
    return serialize_address(address)


async def _get_user_address(session: AsyncSession, user: User, address_id: UUID) -> UserAddress:
    result = await session.execute(
        select(UserAddress)
        .where(UserAddress.address_id == address_id)
        .where(UserAddress.user_id == user.user_id)
    )
    address = result.scalar_one_or_none()
    if address is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found.")
    return address
