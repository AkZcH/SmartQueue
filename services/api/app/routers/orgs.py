from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from app.database import get_db
from app.routers.auth import get_current_user
import psycopg2.extras

router = APIRouter(prefix="/orgs", tags=["orgs"])

class CreateOrgRequest(BaseModel):
    name: str

    @field_validator('name')
    @classmethod
    def name_valid(cls, v):
        v = v.strip()
        if len(v) < 2 or len(v) > 64:
            raise ValueError('Org name must be 2-64 characters')
        return v

class InviteRequest(BaseModel):
    username: str

@router.post("/")
def create_org(req: CreateOrgRequest, user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Check user doesn't already belong to an org
        cur.execute("SELECT org_id FROM users WHERE id = %s", (user['sub'],))
        row = cur.fetchone()
        if row and row['org_id']:
            raise HTTPException(status_code=400, detail="You already belong to an organization")

        # Check org name not taken
        cur.execute("SELECT id FROM organizations WHERE name = %s", (req.name,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Organization name already taken")

        # Create org
        cur.execute(
            "INSERT INTO organizations (name) VALUES (%s) RETURNING *",
            (req.name,)
        )
        org = dict(cur.fetchone())

        # Make creator org_admin
        cur.execute(
            "UPDATE users SET org_id = %s, role = 'org_admin' WHERE id = %s",
            (org['id'], user['sub'])
        )
        conn.commit()
        return {"org": org, "message": "Organization created, you are now org_admin"}

@router.post("/{org_id}/invite")
def invite_user(org_id: str, req: InviteRequest, user=Depends(get_current_user)):
    # Only org_admin or global admin can invite
    if user['role'] not in ('org_admin', 'admin'):
        raise HTTPException(status_code=403, detail="Only org admins can invite users")

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Verify inviter belongs to this org (unless global admin)
        if user['role'] == 'org_admin':
            cur.execute("SELECT org_id FROM users WHERE id = %s", (user['sub'],))
            row = cur.fetchone()
            if not row or str(row['org_id']) != org_id:
                raise HTTPException(status_code=403, detail="You don't belong to this organization")

        # Find the user to invite
        cur.execute("SELECT id, org_id FROM users WHERE username = %s", (req.username,))
        target = cur.fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if target['org_id']:
            raise HTTPException(status_code=400, detail="User already belongs to an organization")

        # Add user to org
        cur.execute(
            "UPDATE users SET org_id = %s WHERE id = %s",
            (org_id, target['id'])
        )
        conn.commit()
        return {"message": f"{req.username} added to organization"}

@router.get("/me")
def get_my_org(user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT o.id, o.name, o.created_at,
                   COUNT(u.id) as member_count
            FROM organizations o
            JOIN users u ON u.org_id = o.id
            WHERE o.id = (SELECT org_id FROM users WHERE id = %s)
            GROUP BY o.id
        """, (user['sub'],))
        org = cur.fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="You don't belong to any organization")
        return dict(org)

@router.get("/me/members")
def get_org_members(user=Depends(get_current_user)):
    if user['role'] not in ('org_admin', 'admin'):
        raise HTTPException(status_code=403, detail="Only org admins can view members")
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, username, role, created_at
            FROM users
            WHERE org_id = (SELECT org_id FROM users WHERE id = %s)
            ORDER BY created_at ASC
        """, (user['sub'],))
        return [dict(r) for r in cur.fetchall()]