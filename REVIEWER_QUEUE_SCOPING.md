# Reviewer Queue Data-Scoping Investigation

## Issue Summary

The IntakeQueue tile (Plan Review workspace) calls `GET /api/spine/cortex/api/engagements` but receives an empty array `[]` despite production having ~31 active engagements.

## Root Cause

The cortex API's `/engagements` endpoint is owner-scoped by default. When called with a service key (as the proxy does), it returns only engagements owned by that service account, which is empty.

According to the operator's note, the old ldt workspace used a **reviewer-BFF path** that returned reviewer-scoped engagements. This path was introduced in **ldt PR #207** where `loadReviewerBffEngagement()` replaced the owner-scoped loading on plan-review BFF engagement routes.

## Required Fix (ldt-side)

The fix requires changes in the **ldt** repository:

1. **Identify the reviewer-scoped endpoint**: Check the ldt codebase (specifically the changes in PR #207) to find the actual endpoint path that the reviewer workspace uses. It's likely something like:
   - `/api/reviewer/engagements` 
   - `/api/plan-review/engagements`
   - `/api/bff/plan-review/engagements`

2. **Update @empressaio/cortex-client**: Modify the client package to either:
   - Add a `reviewerMode` flag that changes the engagements list endpoint
   - Provide a `getReviewerEngagements()` method that calls the correct reviewer-scoped path
   - Make the engagements endpoint configurable per deployment context

3. **Update @empressaio/cortex-tiles**: Update the IntakeQueue tile to use the reviewer-scoped endpoint when in reviewer mode.

## What This PR Does

This PR cannot fix the data-scoping issue directly because:
- The endpoint path is defined in the published `@empressaio/cortex-tiles` package
- The reviewer-scoped API endpoint lives in the ldt cortex-api service
- Making the fix requires coordinated changes across ldt repositories

However, this PR **prepares for the fix** by:
- ✅ Dissolving the nested CortexShell so tiles render natively in the command center
- ✅ Migrating to the published @empressaio/* packages
- ✅ Maintaining the proxy contract and allowlist structure
- 📝 Documenting the exact issue for the ldt team to address

## Proxy Allowlist Ready

If the ldt team adds a reviewer-scoped endpoint (e.g., `/api/reviewer/engagements`), the proxy is already configured to allow it:
- GET requests to all cortex paths are allowed by default
- No proxy changes needed to support the fix

## Action Items for LDT Team

1. Locate the reviewer BFF endpoint from PR #207
2. Add that endpoint to @empressaio/cortex-client as `getReviewerEngagements()` or similar
3. Update IntakeQueue tile to call the reviewer-scoped endpoint
4. Publish new versions of cortex-client and cortex-tiles
5. Update this repo's package.json to use the fixed versions
