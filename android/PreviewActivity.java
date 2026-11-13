package it.atleticosanlorenzo.anteprima;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;

public final class PreviewActivity extends Activity {
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView page = new WebView(this);
        page.getSettings().setJavaScriptEnabled(true);
        page.getSettings().setDomStorageEnabled(true);
        setContentView(page);
        page.loadUrl("file:///android_asset/index.html");
    }
}
