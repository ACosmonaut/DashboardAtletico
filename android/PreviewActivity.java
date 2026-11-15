package it.atleticosanlorenzo.anteprima;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class PreviewActivity extends Activity {
    private static final String DASHBOARD = "https://acosmonaut.github.io/DashboardAtletico/";
    private static final String OFFLINE_DASHBOARD = "file:///android_asset/index.html";

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView page = new WebView(this);
        page.getSettings().setJavaScriptEnabled(true);
        page.getSettings().setDomStorageEnabled(true);
        setContentView(page);
        page.setWebViewClient(new WebViewClient() {
            private void showOfflineDashboard(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && request.getUrl().toString().startsWith(DASHBOARD)) {
                    view.loadUrl(OFFLINE_DASHBOARD);
                }
            }

            @Override public void onReceivedError(
                    WebView view, WebResourceRequest request, WebResourceError error) {
                showOfflineDashboard(view, request);
            }

            @Override public void onReceivedHttpError(
                    WebView view, WebResourceRequest request, WebResourceResponse error) {
                showOfflineDashboard(view, request);
            }
        });
        page.loadUrl(DASHBOARD);
    }
}
