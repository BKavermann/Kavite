package de.kavs.kavite;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;

/**
 * Kavite as an app: a full-screen WebView running the game from assets/www.
 * The files are served under a fixed https origin (not file://), so ES modules,
 * localStorage and IndexedDB work as in a browser. The back key acts like Esc
 * in the game and leaves the app from the main menu. Choosing an own music file
 * in the settings opens Android's file picker.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> pendingPick;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xff04060c);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri url = req.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                String path = url.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                String type = mimeType(path);
                String enc = type.startsWith("text/") || type.endsWith("javascript") || type.endsWith("json") ? "utf-8" : null;
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(type, enc, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            Collections.<String, String>emptyMap(), null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.contains(HOST);    // stay inside the game
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("audio/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Musik wählen"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingPick = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mimeType(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".glb")) return "model/gltf-binary";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK_FILE && pendingPick != null) {
            pendingPick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingPick = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    @Override
    public void onBackPressed() {
        // From a license text opened in the settings back to the game
        if (web.canGoBack()) { web.goBack(); return; }
        // In the main menu (no overlay open) the back key leaves the app, elsewhere it is the game's Esc
        web.evaluateJavascript("document.body.dataset.mode === 'menu' && document.getElementById('settings').hidden && document.getElementById('howto').hidden && document.getElementById('about').hidden", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String atMenu) {
                if ("true".equals(atMenu)) finish();
                else web.evaluateJavascript("dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape'}))", null);
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        web.pauseTimers();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
