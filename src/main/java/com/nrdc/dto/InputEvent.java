package com.nrdc.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class InputEvent {

    public enum Type {
        MOUSE_MOVE,
        MOUSE_PRESS,
        MOUSE_RELEASE,
        MOUSE_WHEEL,
        KEY_PRESS,
        KEY_RELEASE,
        TEXT_INPUT
    }

    private Type type;
    private int x;
    private int y;
    private int button;
    private int keyCode;
    private int wheelDelta;
    private String text;
    private long timestamp;

    public Type getType() {
        return type;
    }

    public void setType(Type type) {
        this.type = type;
    }

    public int getX() {
        return x;
    }

    public void setX(int x) {
        this.x = x;
    }

    public int getY() {
        return y;
    }

    public void setY(int y) {
        this.y = y;
    }

    public int getButton() {
        return button;
    }

    public void setButton(int button) {
        this.button = button;
    }

    public int getKeyCode() {
        return keyCode;
    }

    public void setKeyCode(int keyCode) {
        this.keyCode = keyCode;
    }

    public int getWheelDelta() {
        return wheelDelta;
    }

    public void setWheelDelta(int wheelDelta) {
        this.wheelDelta = wheelDelta;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    @Override
    public String toString() {
        return "InputEvent{type=%s, x=%d, y=%d, button=%d, keyCode=%d, wheelDelta=%d, text=%s}"
                .formatted(type, x, y, button, keyCode, wheelDelta, text);
    }
}
