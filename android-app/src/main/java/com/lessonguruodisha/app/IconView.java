package com.lessonguruodisha.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** Tiny stroked line-icon set for the native header (24x24 design grid). */
public class IconView extends View {
    public static final int BACK = 0, HOME = 1, REFRESH = 2, SHARE = 3;

    private final int icon;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();

    public IconView(Context c, int icon) {
        super(c);
        this.icon = icon;
        p.setColor(Color.WHITE);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        setClickable(true);
        setFocusable(true);
        String[] labels = {"Back", "Home", "Refresh", "Share"};
        setContentDescription(labels[icon]);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float w = getWidth() - getPaddingLeft() - getPaddingRight();
        float s = w / 24f;
        canvas.save();
        canvas.translate(getPaddingLeft(), getPaddingTop());
        canvas.scale(s, s);
        p.setStrokeWidth(2.2f);
        path.reset();
        switch (icon) {
            case BACK:
                path.moveTo(15, 5); path.lineTo(8, 12); path.lineTo(15, 19);
                canvas.drawPath(path, p);
                break;
            case HOME:
                path.moveTo(3.5f, 11); path.lineTo(12, 4); path.lineTo(20.5f, 11);
                path.moveTo(6, 9.5f); path.lineTo(6, 20); path.lineTo(18, 20); path.lineTo(18, 9.5f);
                path.moveTo(10, 20); path.lineTo(10, 14.5f); path.lineTo(14, 14.5f); path.lineTo(14, 20);
                canvas.drawPath(path, p);
                break;
            case REFRESH:
                canvas.drawArc(5, 5, 19, 19, -60, 290, false, p);
                path.moveTo(15.5f, 3.5f); path.lineTo(18.8f, 6.2f); path.lineTo(15.4f, 8.6f);
                canvas.drawPath(path, p);
                break;
            case SHARE:
                p.setStyle(Paint.Style.STROKE);
                canvas.drawCircle(18, 5.5f, 2.6f, p);
                canvas.drawCircle(6, 12, 2.6f, p);
                canvas.drawCircle(18, 18.5f, 2.6f, p);
                path.moveTo(8.3f, 10.8f); path.lineTo(15.7f, 6.7f);
                path.moveTo(8.3f, 13.2f); path.lineTo(15.7f, 17.3f);
                canvas.drawPath(path, p);
                break;
        }
        canvas.restore();
    }
}
