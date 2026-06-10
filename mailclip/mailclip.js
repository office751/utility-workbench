#!/usr/bin/env osascript -l JavaScript
/**
 * mailclip — makes Workbench file links paste PRETTY into Apple Mail.
 *
 * THE PROBLEM: when the Workbench copies a download link, Chrome puts two
 * clipboard flavors on the Mac pasteboard: HTML (the clickable file name)
 * and plain text (the raw URL). Apple Mail's composer ignores the bare HTML
 * flavor — it wants the richer formats Safari writes (RTF / WebArchive),
 * which web pages are NOT allowed to write. So pasting into Mail showed the
 * ugly URL while Notes showed the pretty name.
 *
 * THE FIX: this little daemon watches the clipboard. When it sees a copy
 * that (a) has HTML, (b) lacks RTF/WebArchive, and (c) contains one of OUR
 * project-file links (the Supabase storage marker below — privacy scope:
 * everything else on the clipboard is ignored and untouched), it converts
 * the HTML to RTF + WebArchive with Apple's own `textutil` and adds those
 * flavors alongside. Then ⌘V in Apple Mail pastes the clickable file name.
 *
 * Runs forever via launchd (see install.sh); exits every ~6h so memory from
 * the ObjC bridge never piles up — launchd's KeepAlive restarts it.
 *
 * Mac-pinned, like scanner/ — never imported by the web app.
 */
ObjC.import('Cocoa')

// Only enrich copies that contain OUR file-locker links. Widen or change
// this string if other links should get the same treatment some day.
const MARKER = 'supabase.co/storage'

const TMP_HTML = '/tmp/mailclip-in.html'
const TMP_RTF = '/tmp/mailclip-out.rtf'
const TMP_WA = '/tmp/mailclip-out.webarchive'

const app = Application.currentApplication()
app.includeStandardAdditions = true

const pb = $.NSPasteboard.generalPasteboard

/** true when the pasteboard currently offers `type` */
function has(type) {
  try {
    const t = pb.availableTypeFromArray($([type]))
    return t && !t.isNil()
  } catch (e) {
    return false
  }
}

function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`)
}

log('mailclip watching the clipboard')
let seen = pb.changeCount
let ticks = 0

// ~6 hours of 0.4s ticks, then a clean exit (launchd restarts us fresh).
while (ticks++ < 54000) {
  $.NSThread.sleepForTimeInterval(0.4)
  if (pb.changeCount === seen) continue
  seen = pb.changeCount

  try {
    // Cheap gates first: must have HTML, must not already be rich.
    if (!has('public.html')) continue
    if (has('public.rtf') || has('com.apple.webarchive')) continue

    const htmlData = pb.dataForType('public.html')
    if (!htmlData || htmlData.isNil()) continue
    const htmlStr = $.NSString.alloc.initWithDataEncoding(htmlData, $.NSUTF8StringEncoding)
    if (!htmlStr || htmlStr.isNil() || !htmlStr.js.includes(MARKER)) continue

    // Convert HTML → RTF + WebArchive with Apple's textutil (keeps hyperlinks).
    htmlStr.writeToFileAtomicallyEncodingError(TMP_HTML, true, $.NSUTF8StringEncoding, null)
    app.doShellScript(
      `/usr/bin/textutil -convert rtf -inputencoding UTF-8 -output ${TMP_RTF} ${TMP_HTML}; ` +
      `/usr/bin/textutil -convert webarchive -inputencoding UTF-8 -output ${TMP_WA} ${TMP_HTML}`,
    )
    const rtf = $.NSData.dataWithContentsOfFile(TMP_RTF)
    const wa = $.NSData.dataWithContentsOfFile(TMP_WA)

    // Rewrite with the rich flavors and NO explicit plain text. Proven by
    // testing on this Mac (June 2026): Apple Mail grabs an explicitly-
    // declared plain flavor (the raw URL) even when RTF/WebArchive exist —
    // but with plain absent, macOS synthesizes a plain rendering FROM the
    // RTF (= the file name) and Mail takes the rich flavor: blue clickable
    // name. Trade-off: pasting into a plain-text field gives the file NAME,
    // not the URL — for a raw URL use 📤 Share → Text, or ⬇ Open.
    pb.clearContents
    pb.setDataForType(htmlData, 'public.html')
    if (rtf && !rtf.isNil()) pb.setDataForType(rtf, 'public.rtf')
    if (wa && !wa.isNil()) pb.setDataForType(wa, 'com.apple.webarchive')

    seen = pb.changeCount // our own write — don't reprocess it
    log('enriched a Workbench link copy (added RTF + WebArchive)')
  } catch (e) {
    log(`error (skipped this copy): ${e}`)
  }
}

log('6h tick limit reached — exiting clean, launchd restarts us')
