from fastapi import APIRouter

from app.api.v1 import approvals, auth, customer, delivery, disputes, health, pharmacy, reconciliation, settlement, super_admin, ws
from app.api.v1.background_jobs_api import router as background_jobs_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(customer.router)
api_router.include_router(pharmacy.router)
api_router.include_router(super_admin.router)
api_router.include_router(delivery.router)
api_router.include_router(approvals.router)
api_router.include_router(settlement.router)
api_router.include_router(reconciliation.router)
api_router.include_router(disputes.router)
api_router.include_router(ws.router)
api_router.include_router(background_jobs_router)
