# Search Messages

## Definition

A real-time text filter that narrows the visible messages in the current chat room to only those containing the entered keyword or phrase.

## Purpose

To locate a specific message within the current session's chat history without scrolling through the entire conversation.

## Access

Left sidebar of the chat room. Panel under the "Search Messages" heading. Available to both host and member roles.

## Usage Steps

1. While in a chat room, locate the "Search Messages" panel in the left sidebar.
2. Click the text field labeled "FILTER_BY_KEYWORD".
3. Type a word or phrase. The message list filters in real time — no submit button is required.
4. Matching text within each visible message is highlighted in amber.
5. To clear the filter: click the ✕ button inside the search field, or delete all entered text.

## Result

- Only messages whose body text contains the entered keyword remain visible.
- Matched text is highlighted with an amber background.
- If no messages match, the message area shows `No messages match "<keyword>"`.
- Clearing the search restores the full message list.

## Notes/Limitations

- Search is local and processes only messages currently in the browser. It does not query the server.
- Search applies to message body text only. File attachment names, peer IDs, and timestamps are not searched.
- Matching is case-insensitive.
- Messages that have already auto-disappeared (5-minute ephemeral timer) are not searchable.
