package com.pneulab.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * PneuLab for Android.
 *
 * The whole workshop is the web app in assets/www, shown in one WebView. Nothing is loaded from the
 * network: every request to the app's own address is answered from the assets, and every other
 * address is refused. This class adds only what a web page cannot do by itself inside an app:
 * saving files, the share sheet, printing, the back gesture, keeping the screen on, and opening
 * pneulab:// links.
 */
public class MainActivity extends Activity {
    /** A host name reserved for exactly this: local files served under an https address. */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    /** The same page read straight from the package. Used only if a device refuses the address above. */
    private static final String PLAIN = "file:///android_asset/www/index.html";
    private static final String PLAIN_ROOT = "file:///android_asset/www/";
    private static final int PICK_FILE = 41;
    private static final Pattern LINK = Pattern.compile("^pneulab://c/[\\w-]{8,60000}$");
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("css", "text/css");
        MIME.put("js", "text/javascript");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
    }

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> filePick;
    private String pendingLink;
    private boolean pageReady;
    private boolean triedPlain;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF10141B);
        web = new WebView(this);
        web.setBackgroundColor(0xFF10141B);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        edgeToEdge();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                       // lessons done, stars and saved circuits live in localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.addJavascriptInterface(new Bridge(), "PneuLabNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        pendingLink = linkFrom(getIntent());
        web.loadUrl(HOME);
    }

    /** Draw behind the system bars and keep the page clear of them, of the display cutout and of the keyboard. */
    @SuppressWarnings("deprecation")
    private void edgeToEdge() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            if (Build.VERSION.SDK_INT < 35) {
                w.setStatusBarColor(Color.TRANSPARENT);
                w.setNavigationBarColor(Color.TRANSPARENT);
            }
            w.setNavigationBarContrastEnforced(false);
            root.setOnApplyWindowInsetsListener((v, in) -> {
                Insets bars = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = in.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        } else {
            w.setStatusBarColor(0xFF10141B);
            w.setNavigationBarColor(0xFF10141B);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String link = linkFrom(intent);
        if (link != null) {
            pendingLink = link;
            deliverLink();
        }
    }

    private static String linkFrom(Intent i) {
        Uri u = i == null ? null : i.getData();
        if (u == null || !Intent.ACTION_VIEW.equals(i.getAction())) return null;
        String s = u.toString();
        return LINK.matcher(s).matches() ? s : null;        // only letters, digits, - and _ get past this, so it is safe to quote below
    }

    private void deliverLink() {
        if (!pageReady || pendingLink == null) return;
        String link = pendingLink;
        pendingLink = null;
        web.evaluateJavascript("window.EP&&EP.openCode&&EP.openCode('" + link + "')", null);
    }

    /** Back closes whatever is open in the page, innermost first. Only when the page has nothing left to close does the app end. */
    private void goBack() {
        web.evaluateJavascript("(function(){try{return !!(window.EP&&EP.back&&EP.back())}catch(e){return false}})()",
                r -> { if (!"true".equals(r)) finish(); });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goBack();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        root.removeView(web);
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && filePick != null) {
            filePick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            filePick = null;
        }
    }

    private void say(final String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
    }

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest rq) {
            Uri u = rq.getUrl();
            String scheme = u.getScheme();
            if (!"http".equals(scheme) && !"https".equals(scheme)) return null;     // data: and blob: are made by the page itself
            if (!HOST.equals(u.getHost())) return notFound();                       // the app never talks to the network
            String path = u.getPath();
            if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return notFound();
            int dot = path.lastIndexOf('.');
            String type = dot < 0 ? null : MIME.get(path.substring(dot + 1).toLowerCase());
            if (type == null) return notFound();
            try {
                InputStream in = getAssets().open("www" + path);
                boolean text = type.startsWith("text/") || type.endsWith("json") || type.endsWith("xml");
                return new WebResourceResponse(type, text ? "utf-8" : null, in);
            } catch (IOException e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest rq) {
            String url = rq.getUrl().toString();
            return !HOST.equals(rq.getUrl().getHost()) && !url.startsWith(PLAIN_ROOT);    // the page stays inside the app; nothing else is ever opened here
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest rq, android.webkit.WebResourceError error) {
            if (rq.isForMainFrame() && !triedPlain && rq.getUrl().toString().startsWith(HOME)) {
                triedPlain = true;                          // this device will not serve the packed files under the https address: read them as plain files
                view.post(() -> view.loadUrl(PLAIN));
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url != null && url.startsWith(triedPlain ? PLAIN : HOME)) {
                pageReady = true;
                deliverLink();
            }
        }
    }

    private class Chrome extends WebChromeClient {
        /** "Load from file" in the sandbox: let the user pick a saved circuit. */
        @Override
        @SuppressWarnings("deprecation")
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePick != null) filePick.onReceiveValue(null);
            filePick = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(pick, "Open a PneuLab circuit"), PICK_FILE);
            } catch (Exception e) {
                filePick = null;
                return false;
            }
            return true;
        }
    }

    /** What the page may ask the app to do. The page reaches these as window.PneuLabNative. They are called on a background thread. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            String safe = (name == null ? "" : name).replaceAll("[^\\w.\\- ]", "_");
            if (safe.isEmpty() || safe.startsWith(".")) safe = "pneulab" + safe;
            if (safe.length() > 60) safe = safe.substring(safe.length() - 60);
            String type = mime != null && mime.matches("[\\w.+-]+/[\\w.+-]+") ? mime : "application/octet-stream";
            Uri row = null;
            String where;
            try {
                if (base64 == null || base64.length() > 40_000_000) throw new IOException("too large");
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, type);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PneuLab");
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    row = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (row == null) throw new IOException("no place to save");
                    try (OutputStream out = getContentResolver().openOutputStream(row)) {
                        if (out == null) throw new IOException("cannot write");
                        out.write(data);
                    }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(row, v, null, null);
                    where = "Downloads/PneuLab/" + safe;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IOException("no storage");
                    File f = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(f)) {
                        out.write(data);
                    }
                    where = f.getAbsolutePath();
                }
            } catch (Exception e) {
                if (row != null) {
                    try { getContentResolver().delete(row, null, null); } catch (Exception ignored) { /* nothing was written */ }
                }
                say("This file could not be saved.");
                return;
            }
            say("Saved: " + where);
        }

        @JavascriptInterface
        public void share(String text) {
            if (text == null || text.length() > 200_000) return;
            final Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> {
                try {
                    startActivity(Intent.createChooser(send, "Send this circuit"));
                } catch (Exception e) {
                    say("No app on this device can send it.");
                }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            if (text == null || text.length() > 200_000) return;
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("PneuLab circuit", text));
            });
        }

        /** The certificate: the page already has a print layout, so the system print dialog gets the page as it is. */
        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) {
                    say("Printing is not available on this device.");
                    return;
                }
                pm.print("PneuLab certificate", web.createPrintDocumentAdapter("PneuLab certificate"), new PrintAttributes.Builder().build());
            });
        }

        /** While a machine is running on the bench the screen stays on. */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** The area behind the status and navigation bars takes the colour of the page, and the bar icons the opposite shade. */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void theme(final boolean dark, final String color) {
            runOnUiThread(() -> {
                int c;
                try {
                    c = Color.parseColor(color);
                } catch (Exception e) {
                    c = dark ? 0xFF171C25 : 0xFFFBF9F4;
                }
                root.setBackgroundColor(c);
                Window w = getWindow();
                if (Build.VERSION.SDK_INT >= 30) {
                    WindowInsetsController ic = w.getInsetsController();
                    int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    if (ic != null) ic.setSystemBarsAppearance(dark ? 0 : light, light);
                } else {
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                    View d = w.getDecorView();
                    int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    d.setSystemUiVisibility(dark ? d.getSystemUiVisibility() & ~light : d.getSystemUiVisibility() | light);
                }
            });
        }
    }
}
