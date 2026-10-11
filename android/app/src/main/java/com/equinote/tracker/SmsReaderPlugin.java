package com.equinote.tracker;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * On-device inbox reader for bank/UPI transaction SMS.
 * Nothing leaves the phone: the JS layer parses messages locally and the
 * user picks which debits become expense records.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms")
    }
)
public class SmsReaderPlugin extends Plugin {

    @PluginMethod
    public void checkSmsPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestSmsPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermCallback");
    }

    @PermissionCallback
    private void smsPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void readInbox(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }
        int limit = call.getInt("limit", 200);
        if (limit <= 0 || limit > 500) {
            limit = 200;
        }
        double sinceDouble = call.getDouble("since", 0);
        long since = (long) sinceDouble;

        JSArray messages = new JSArray();
        ContentResolver cr = getContext().getContentResolver();
        Uri uri = Uri.parse("content://sms/inbox");
        String[] projection = new String[] { "_id", "address", "body", "date" };
        String selection = since > 0 ? "date >= ?" : null;
        String[] selectionArgs = since > 0 ? new String[] { String.valueOf(since) } : null;

        Cursor cursor = null;
        try {
            cursor = cr.query(uri, projection, selection, selectionArgs, "date DESC");
            if (cursor != null) {
                int iId = cursor.getColumnIndexOrThrow("_id");
                int iAddr = cursor.getColumnIndexOrThrow("address");
                int iBody = cursor.getColumnIndexOrThrow("body");
                int iDate = cursor.getColumnIndexOrThrow("date");
                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    JSObject m = new JSObject();
                    m.put("id", cursor.getString(iId));
                    m.put("address", cursor.getString(iAddr));
                    m.put("body", cursor.getString(iBody));
                    m.put("date", cursor.getLong(iDate));
                    messages.put(m);
                    count++;
                }
            }
            JSObject ret = new JSObject();
            ret.put("messages", messages);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read SMS inbox", e);
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }
}
