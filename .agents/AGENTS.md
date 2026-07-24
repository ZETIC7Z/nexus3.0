# Workspace Agent Rules & Behavioral Constraints

## 1. Mandatory AI Agent Auto-Changelog & Notification Protocol (HIGH PRIORITY)

Every time an AI Agent works on tasks, fixes, improvements, or is asked by the user to push updates to GitHub, the AI Agent **MUST AUTOMATICALLY** perform the following reporting steps before finishing:

1. **Update `README.md` Changelog**:
   - Locate the `## Automated Project Changelog` section in `README.md`.
   - Add a new timestamped entry at the top of the changelog list formatted as `### [Month Date, Year - Time] — Brief Title`.
   - List every task completed, architectural changes made, and files touched during the session.

2. **Publish Live In-App Notification (`public/notifications.xml`)**:
   - If the task introduced major improvements, bug fixes, or new user-facing features, open `public/notifications.xml`.
   - Prepend a new `<item>` block right below `<lastBuildDate>` inside `<channel>`.
   - Assign a unique `<guid>` (e.g. `nexus-notif-YYYY-MM-DD-featurename`) so users' browsers (`getUnreadCount()`) detect the announcement and display the red unread badge.
   - Set `<pubDate>` to the current timestamp and provide a clean `<title>` and `<description>`.

3. **Verify Codebase Cleanliness**:
   - Always run `npm run build` after making modifications to ensure 0 TypeScript or compilation errors.
