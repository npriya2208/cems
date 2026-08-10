import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads backend/.env if present; no-op (with a console note) if it doesn't exist
except ImportError:
    print("[CEMS] python-dotenv not installed — relying on real environment variables only "
          "(pip install python-dotenv to use a .env file).")

from database import init_db
from routers import auth, events, registrations, feedback, notifications, venues, resources, users, analytics

app = FastAPI(
    title="CEMS API",
    description="College Event Management System — REST API",
    version="1.0.0",
)

# CORS: The frontend uses Bearer token auth (not cookies), so credentials=False
# is correct and allows allow_origins=["*"] without browser rejection.
# If you add cookie-based sessions in future, switch to explicit origins list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database tables and seed demo data if empty
init_db()

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(registrations.router, prefix="/api/registrations", tags=["registrations"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(venues.router, prefix="/api/venues", tags=["venues"])
app.include_router(resources.router, prefix="/api/resources", tags=["resources"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])


@app.get("/api/health", tags=["health"])
def health_check():
    """Quick liveness probe."""
    return {"status": "ok", "service": "CEMS API"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=4000, reload=True)
