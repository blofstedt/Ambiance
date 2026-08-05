package com.ambient.canvas.overlay;

import static org.junit.Assert.assertEquals;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * AND-05: this asserted "com.getcapacitor.app" while the module namespace is
 * "com.ambient.canvas.overlay", so it failed on every run. It also lived in the
 * stale com.getcapacitor.myapp package left over from the Capacitor template.
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // debug builds carry the .debug applicationIdSuffix
        assertEquals("com.ambient.canvas.overlay", appContext.getPackageName().replace(".debug", ""));
    }
}
