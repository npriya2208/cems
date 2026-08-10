import os
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
#
# Set CEMS_ALLOWED_ORIGINS on Render to a comma-separated list (e.g. your
# Vercel URL) to lock this down; otherwise it defaults to "*" for convenience.
_origins_env = os.environ.get("CEMS_ALLOWED_ORIGINS", "*")
allow_origins = ["*"] if _origins_env.strip() == "*" else [
    o.strip() for o in _origins_env.split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
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
    # Render (and most PaaS hosts) inject the port to bind via $PORT.
    # Falls back to 4000 for local development.
    port = int(os.environ.get("PORT", 4000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
