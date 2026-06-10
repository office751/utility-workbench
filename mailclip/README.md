# mailclip — pretty link pastes for Apple Mail

Apple Mail ignores the HTML clipboard flavor Chrome writes, so pasting a
Workbench file link into Mail showed the raw URL instead of the clickable
file name (Notes worked — it reads HTML). Web pages can't write the RTF /
WebArchive flavors Mail wants, so this tiny daemon does it from outside the
browser: it watches the clipboard and, **only when a copy contains one of
our Supabase file-locker links**, adds RTF + WebArchive renderings of the
same content. Then ⌘V in Mail pastes the blue clickable file name.

- **Install:** `./install.sh` (LaunchAgent, current user, survives reboots)
- **Uninstall:** `./install.sh -u`
- **Logs:** `logs/mailclip.log`
- **Privacy scope:** copies that don't contain `supabase.co/storage` are
  never read past the type check and never modified.
- **Trade-off (deliberate):** enriched copies carry NO explicit plain-text
  flavor — Mail was proven (June 2026, this Mac) to grab an explicit plain
  URL over the rich flavors. macOS synthesizes plain text from the RTF
  instead, so plain-text fields paste the file NAME. Need the raw URL?
  📤 Share → Text, or ⬇ Open and copy from the address bar.
- **Mac-pinned** like `scanner/` — this folder is never imported by the
  web app. Adam's other machines don't need it unless they also compose
  in Apple Mail.
