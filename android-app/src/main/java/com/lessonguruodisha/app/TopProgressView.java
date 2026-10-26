package com.lessonguruodisha.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.view.View;

/** Thin gradient loading bar that eases forward and fades out when done. */
public class TopProgressView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float shown, target;

    public TopProgressView(Context c) {
        super(c);
        setAlpha(0f);
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        paint.setShader(new LinearGradient(0, 0, w, 0,
                new int[]{0xFFFFB800, 0xFFFF2D78, 0xFF8B5CF6}, null, Shader.TileMode.CLAMP));
    }

    public void setProgress(int p) {
        target = p / 100f;
        if (p < 100) {
            animate().cancel();
            setAlpha(1f);
        } else {
            animate().alpha(0f).setStartDelay(250).setDuration(300).withEndAction(() -> {
                shown = 0;
                target = 0;
            }).start();
        }
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        shown += (target - shown) * 0.18f;
        c.drawRect(0, 0, getWidth() * shown, getHeight(), paint);
        if (Math.abs(target - shown) > 0.002f) postInvalidateOnAnimation();
    }
}
