# Statement of Intent: Cloud Auth, Roles, and Recipe Pipeline

## Core Parameters

- **Outcome**: Complete cloud migration to Supabase featuring JWT session auth, three tier role based permissions (user, recipe creator, admin), a pending recipe approval pipeline with UUID access for drafts, an administrative management dashboard, and a 2-in-1 sliding authentication modal overlay with blurred food photography.
- **User**: The administrator (moderation and direct publishing), recipe creators (authoring and submitting to review), and general users (browsing, saving dishes, applying for creator status).
- **Why now**: Eliminating local storage dependencies in favor of a centralized cloud database with community growth, content moderation, and structured contributor roles.
- **Success**: Users log in and register through the sliding modal overlay. Recipe creators draft and submit recipes to pending review. The administrator manages, edits, approves, or revokes submissions via the admin panel. Approved recipes publish under human readable slugs while pending drafts remain accessible solely by UUID.
- **Constraints**: No dedicated full page auth route (modal overlay only). Zero local storage reliance for catalog and profile records. Usernames (@handle) are unique and changeable once per 30 days. Display names are changeable every 24 hours. Pending recipes are isolated to UUID routes.
- **Out of Scope**: Full implementation of the Recipe Suggest page (button remains disabled and greyed out). Automated API key rotation scripts. Threaded comment nesting beyond 3 tiers without @mentions.

## User Decisions and Context

1. **Architecture and Phasing**: The prompt will present the complete architectural picture to the target agent, but explicitly instruct it to generate a structured implementation plan broken down into sequential phases before writing code.
2. **Database Provider**: Supabase project "Hiep's Project" (ref: `rtrifsdkiovhoorghxyc`, region: `ap-southeast-2`) is restored and active.
3. **Role Promotion**:
   - Initial admin role set directly in Supabase or seeded.
   - Users can submit a creator application form supporting raw and source markdown views explaining their targets and recipe experience.
   - Admin panel allows approving, promoting, demoting, archiving, or scheduling deletion for any account.
4. **Auth Interface**:
   - 2-in-1 sliding modal overlay (no separate page route) with high quality food imagery sourced from Wikimedia MCP and heavily blurred contrasting dark backdrop.
5. **Kitchen Studio**:
   - Creators have a "Sent Recipes" / "Pending Review" tab.
   - Admin Kitchen Studio has direct publishing without a pending tab.
