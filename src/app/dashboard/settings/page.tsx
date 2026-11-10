import Link from "next/link";
import { Card, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { canManage } from "@/lib/plan";
import { ORG_TYPES } from "@/lib/validation";
import { APP_URL } from "@/lib/utils";
import { dateStr } from "@/lib/format";
import { changePasswordAction, changeRoleAction, invitePersonAction, removeMemberAction, revokeInviteAction, saveOrgAction, saveProfileAction } from "./actions";

type Member = { user_id: string; full_name: string; email: string; role: "owner" | "admin" | "staff"; joined_at: string };

export default async function SettingsPage() {
  const ctx = await requireOrg({ allowUnpaid: true });
  const supabase = await createClient();
  const [{ data: profile }, { data: org }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,country").eq("id", ctx.userId).single(),
    supabase.from("organizations").select("name,type,country").eq("id", ctx.orgId).single(),
    supabase.rpc("list_org_members", { p_org: ctx.orgId }),
    canManage(ctx) ? supabase.from("organization_invitations").select("id,email,role,token,expires_at").eq("organization_id", ctx.orgId).is("accepted_at", null).gt("expires_at", new Date().toISOString()) : Promise.resolve({ data: [] }),
  ]);
  const manage = canManage(ctx), owner = ctx.role === "owner";

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card><h2 className="mb-3 text-lg font-semibold">Profile</h2>
        <ActionForm action={saveProfileAction}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name"><Input name="full_name" defaultValue={profile?.full_name} required /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={profile?.phone ?? ""} /></Field>
            <Field label="Country"><Input name="country" defaultValue={profile?.country ?? ""} /></Field>
          </div>
          <p className="text-xs text-slate-500">Signed in as {ctx.email}</p>
        </ActionForm></Card>

      <Card><h2 className="mb-3 text-lg font-semibold">Organization</h2>
        {manage ? (
          <ActionForm action={saveOrgAction}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name"><Input name="name" defaultValue={org?.name} required /></Field>
              <Field label="Type"><Select name="type" defaultValue={org?.type}>{ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Country"><Input name="country" defaultValue={org?.country ?? ""} /></Field>
            </div>
          </ActionForm>
        ) : <p className="text-sm text-slate-600">{org?.name}. Only owners and administrators can edit organization details.</p>}</Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-lg font-semibold">Team &amp; roles</h2>
        <p className="px-5 text-sm text-slate-500">Owners manage everything including billing and roles. Administrators manage locations, suppliers, approvals and staff. Staff handle day-to-day inventory.</p>
        <table className="mt-3 w-full min-w-[560px] text-left text-sm">
          <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">Member</th><th>Joined</th><th>Role</th><th /></tr></thead>
          <tbody>{((members as Member[] | null) ?? []).map((m) => (
            <tr key={m.user_id} className="border-b border-slate-100 last:border-0">
              <td className="px-5 py-2.5"><p className="font-medium">{m.full_name || m.email}</p><p className="text-xs text-slate-500">{m.email}</p></td>
              <td>{dateStr(m.joined_at)}</td>
              <td>{owner && m.user_id !== ctx.userId ? (
                <form action={changeRoleAction.bind(null, m.user_id)} className="flex gap-2"><select name="role" defaultValue={m.role} aria-label="Role" className="h-8 rounded border border-slate-300 px-2 text-sm"><option value="owner">Owner</option><option value="admin">Administrator</option><option value="staff">Staff</option></select><button className="text-xs text-teal-600 hover:underline">Save</button></form>
              ) : <span className="capitalize">{m.role}</span>}</td>
              <td className="pr-5 text-right">{m.role !== "owner" && m.user_id !== ctx.userId && (owner || (manage && m.role === "staff")) && (
                <form action={removeMemberAction.bind(null, m.user_id)}><button className="text-xs text-red-700 hover:underline">Remove</button></form>)}</td>
            </tr>))}</tbody>
        </table>
        {manage && (
          <div className="space-y-4 border-t border-slate-200 p-5">
            <h3 className="font-semibold">Invite a team member</h3>
            <ActionForm action={invitePersonAction} submit="Create invitation" className="grid items-end gap-4 sm:grid-cols-3">
              <Field label="Work email"><Input name="email" type="email" required /></Field>
              <Field label="Role"><Select name="role" defaultValue="staff"><option value="staff">Staff</option>{owner && <option value="admin">Administrator</option>}</Select></Field>
            </ActionForm>
            {(invites ?? []).length > 0 && (
              <div><h4 className="mb-1 text-sm font-medium">Pending invitations</h4>
                <p className="mb-2 text-xs text-slate-500">Mediverse does not send invitation emails yet. Copy the link and send it to the person yourself. It works only for the email address you entered and expires in 7 days.</p>
                <ul className="space-y-2 text-sm">{(invites ?? []).map((i) => (
                  <li key={i.id} className="rounded border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><span>{i.email} · <span className="capitalize">{i.role}</span></span>
                    <form action={revokeInviteAction.bind(null, i.id)}><button className="text-xs text-red-700 hover:underline">Revoke</button></form></div>
                    <input readOnly value={`${APP_URL}/invite/${i.token}`} aria-label={`Invitation link for ${i.email}`} className="mt-2 w-full rounded bg-soft px-2 py-1.5 text-xs" onFocus={undefined} /></li>))}</ul></div>
            )}
          </div>
        )}
      </Card>

      <Card><h2 className="mb-1 text-lg font-semibold">Notifications &amp; inventory preferences</h2>
        <p className="text-sm text-slate-600">Alert types, expiry warning period and unusual-consumption sensitivity are on the <Link href="/dashboard/alerts" className="text-teal-600 underline">Stock Alerts</Link> page. Subscription details are under <Link href="/dashboard/billing" className="text-teal-600 underline">Billing &amp; Subscription</Link>.</p></Card>

      <Card><h2 className="mb-3 text-lg font-semibold">Security</h2>
        <ActionForm action={changePasswordAction} submit="Change password" className="grid items-end gap-4 sm:grid-cols-3">
          <Field label="New password" hint="10+ characters, upper and lower case, a number"><Input name="password" type="password" autoComplete="new-password" required /></Field>
          <Field label="Confirm password"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
        </ActionForm>
        <p className="mt-3 text-xs text-slate-500">Changing your password signs you out on other devices.</p></Card>
    </div>
  );
}
