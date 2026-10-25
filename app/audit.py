
import hashlib
import hmac
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, utc_now


GENESIS_HASH = "0" * 64


def format_canonical_datetime(dt: datetime) -> str:
    """Convert a datetime into a stable UTC ISO timestamp."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def compute_event_hash(
    *,
    actor_id: int | None,
    action: str,
    document_id: int | None,
    details: str,
    created_at: datetime,
    prev_hash: str,
) -> str:
    """Calculate a deterministic SHA-256 hash for an audit event."""
    payload = {
        "action": action,
        "actor_id": actor_id,
        "created_at": format_canonical_datetime(created_at),
        "details": details,
        "document_id": document_id,
        "prev_hash": prev_hash,
    }

    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

    return hashlib.sha256(encoded).hexdigest()


def record_audit_event(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    document_id: int | None = None,
    details: str = "",
    timestamp: datetime | None = None,
) -> AuditEvent:
    """
    Add an audit event linked to the latest existing event.

    Refuse to append if the latest event has no valid hash.
    Never silently restart the audit chain.
    """
    latest_event = db.scalar(
        select(AuditEvent)
        .order_by(AuditEvent.id.desc())
        .limit(1)
    )

    if latest_event is None:
        prev_hash = GENESIS_HASH
    else:
        if not latest_event.hash:
            raise RuntimeError(
                f"Cannot append audit event: event ID {latest_event.id} "
                "has no hash. Investigate the legacy audit records first."
            )

        if len(latest_event.hash) != 64:
            raise RuntimeError(
                f"Cannot append audit event: event ID {latest_event.id} "
                "has an invalid hash length."
            )

        prev_hash = latest_event.hash

    event_time = timestamp or utc_now()

    event_hash = compute_event_hash(
        actor_id=actor_id,
        action=action,
        document_id=document_id,
        details=details,
        created_at=event_time,
        prev_hash=prev_hash,
    )

    event = AuditEvent(
        actor_id=actor_id,
        action=action,
        document_id=document_id,
        details=details,
        created_at=event_time,
        prev_hash=prev_hash,
        hash=event_hash,
    )

    db.add(event)
    db.flush()

    return event


def verify_audit_chain(db: Session) -> dict:
    """
    Verify the hash-linked audit chain.

    A leading sequence of legacy events with no hashes is reported
    as unverifiable, not silently repaired or treated as valid.
    """
    events = db.scalars(
        select(AuditEvent).order_by(AuditEvent.id.asc())
    ).all()

    total = len(events)

    if not events:
        return {
            "is_valid": True,
            "total_events": 0,
            "verified_events": 0,
            "message": "Audit chain is empty and valid.",
            "tampered_event_id": None,
        }

    legacy_events = []
    hashed_events = []
    chain_started = False

    for event in events:
        missing_both = not event.prev_hash and not event.hash

        if missing_both and not chain_started:
            legacy_events.append(event)
        else:
            chain_started = True
            hashed_events.append(event)

    if not hashed_events:
        return {
            "is_valid": False,
            "total_events": total,
            "verified_events": 0,
            "message": (
                f"{len(legacy_events)} legacy event(s) have no hashes; "
                "their integrity cannot be verified."
            ),
            "tampered_event_id": (
                legacy_events[0].id if legacy_events else None
            ),
        }

    expected_prev_hash = GENESIS_HASH
    verified_count = 0

    for event in hashed_events:
        if not event.prev_hash or not event.hash:
            return {
                "is_valid": False,
                "total_events": total,
                "verified_events": verified_count,
                "message": (
                    f"Event ID {event.id} has a missing hash. "
                    "The chain cannot be fully verified."
                ),
                "tampered_event_id": event.id,
            }

        if len(event.prev_hash) != 64 or len(event.hash) != 64:
            return {
                "is_valid": False,
                "total_events": total,
                "verified_events": verified_count,
                "message": f"Malformed hash at event ID {event.id}.",
                "tampered_event_id": event.id,
            }

        if event.prev_hash != expected_prev_hash:
            return {
                "is_valid": False,
                "total_events": total,
                "verified_events": verified_count,
                "message": (
                    f"Broken chain link at event ID {event.id}: "
                    "previous hash mismatch."
                ),
                "tampered_event_id": event.id,
            }

        calculated_hash = compute_event_hash(
            actor_id=event.actor_id,
            action=event.action,
            document_id=event.document_id,
            details=event.details or "",
            created_at=event.created_at,
            prev_hash=event.prev_hash,
        )

        if not hmac.compare_digest(event.hash, calculated_hash):
            return {
                "is_valid": False,
                "total_events": total,
                "verified_events": verified_count,
                "message": (
                    f"Event content or hash mismatch at event ID {event.id}."
                ),
                "tampered_event_id": event.id,
            }

        expected_prev_hash = event.hash
        verified_count += 1

    if legacy_events:
        return {
            "is_valid": False,
            "total_events": total,
            "verified_events": verified_count,
            "message": (
                f"Verified {verified_count} hashed event(s). "
                f"{len(legacy_events)} legacy event(s) have no hashes "
                "and remain unverifiable."
            ),
            "tampered_event_id": legacy_events[0].id,
        }

    return {
        "is_valid": True,
        "total_events": total,
        "verified_events": verified_count,
        "message": (
            f"Audit chain verified successfully across {verified_count} events."
        ),
        "tampered_event_id": None,
    }
