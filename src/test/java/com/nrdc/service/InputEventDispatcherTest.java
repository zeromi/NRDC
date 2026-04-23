package com.nrdc.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nrdc.dto.InputEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.awt.Robot;
import java.awt.AWTException;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InputEventDispatcherTest {

    private InputEventDispatcher dispatcher;

    @Mock
    private ScreenCaptureService screenCaptureService;

    @Mock
    private Robot robot;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() throws AWTException {
        when(screenCaptureService.getRobot()).thenReturn(robot);
        dispatcher = new InputEventDispatcher(screenCaptureService);
    }

    @Test
    void dispatch_mouseMove_callsRobotMouseMove() {
        InputEvent event = new InputEvent();
        event.setType(InputEvent.Type.MOUSE_MOVE);
        event.setX(100);
        event.setY(200);

        dispatcher.dispatch(toJson(event));
        verify(robot).mouseMove(100, 200);
    }

    @Test
    void dispatch_mousePress_callsRobotMousePress() {
        InputEvent event = new InputEvent();
        event.setType(InputEvent.Type.MOUSE_PRESS);
        event.setX(50);
        event.setY(50);
        event.setButton(1);

        dispatcher.dispatch(toJson(event));
        verify(robot).mousePress(anyInt());
    }

    @Test
    void dispatch_mouseRelease_callsRobotMouseRelease() {
        InputEvent event = new InputEvent();
        event.setType(InputEvent.Type.MOUSE_RELEASE);
        event.setButton(3);

        dispatcher.dispatch(toJson(event));
        verify(robot).mouseRelease(anyInt());
    }

    @Test
    void dispatch_mouseWheel_callsRobotMouseWheel() {
        InputEvent event = new InputEvent();
        event.setType(InputEvent.Type.MOUSE_WHEEL);
        event.setWheelDelta(-3);

        dispatcher.dispatch(toJson(event));
        verify(robot).mouseWheel(-3);
    }

    @Test
    void dispatch_keyPress_callsRobotKeyPress() {
        InputEvent event = new InputEvent();
        event.setType(InputEvent.Type.KEY_PRESS);
        event.setKeyCode(65); // 'A'

        dispatcher.dispatch(toJson(event));
        verify(robot).keyPress(65);
    }

    @Test
    void dispatch_keyRelease_callsRobotKeyRelease() {
        InputEvent event = new InputEvent();
        event.setType(InputEvent.Type.KEY_RELEASE);
        event.setKeyCode(65);

        dispatcher.dispatch(toJson(event));
        verify(robot).keyRelease(65);
    }

    @Test
    void dispatch_invalidJson_doesNotThrow() {
        dispatcher.dispatch("{invalid json}");
        verifyNoInteractions(robot);
    }

    private String toJson(InputEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
