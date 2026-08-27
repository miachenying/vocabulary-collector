# Vocabulary Collector V3 Chrome extension

This unpacked Manifest V3 extension removes the copy-and-paste step from web reading.

## Install for development

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extensions/chrome` directory.

## Use

- Select English text on a page.
- Right-click and choose **Look up … in Vocabulary Collector**.
- Or press `Command+Shift+V` on macOS / `Alt+Shift+V` elsewhere.
- Vocabulary Collector opens with the selection, nearby context, page title, and URL prefilled.
- Review the captured context and choose **Look up**. Sign in with ChatGPT when prompted.

The extension stores no credentials and does not call private collection APIs directly. Restricted browser pages still open with the selected text and source metadata, without surrounding context.
