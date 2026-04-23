package com.nrdc.websocket;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SessionManagerTest {

    private SessionManager sessionManager;

    @Mock
    private WebSocketSession session;

    @BeforeEach
    void setUp() {
        sessionManager = new SessionManager();
    }

    @Test
    void addSession_incrementsCount() {
        assertEquals(0, sessionManager.getSessionCount());

        sessionManager.addSession(session);
        assertEquals(1, sessionManager.getSessionCount());
    }

    @Test
    void removeSession_decrementsCount() {
        sessionManager.addSession(session);
        assertEquals(1, sessionManager.getSessionCount());

        sessionManager.removeSession(session);
        assertEquals(0, sessionManager.getSessionCount());
    }

    @Test
    void hasActiveSessions_returnsCorrectState() {
        assertFalse(sessionManager.hasActiveSessions());

        sessionManager.addSession(session);
        assertTrue(sessionManager.hasActiveSessions());

        sessionManager.removeSession(session);
        assertFalse(sessionManager.hasActiveSessions());
    }

    @Test
    void broadcastScreenFrame_sendsToAllSessions() throws IOException {
        var session2 = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        when(session2.isOpen()).thenReturn(true);

        sessionManager.addSession(session);
        sessionManager.addSession(session2);

        byte[] frameData = new byte[]{0x01, 0x02, 0x03};
        sessionManager.broadcastScreenFrame(frameData);

        verify(session, times(1)).sendMessage(any(BinaryMessage.class));
        verify(session2, times(1)).sendMessage(any(BinaryMessage.class));
    }

    @Test
    void broadcastScreenFrame_skipsClosedSessions() throws IOException {
        when(session.isOpen()).thenReturn(false);

        sessionManager.addSession(session);
        sessionManager.broadcastScreenFrame(new byte[]{0x01});

        verify(session, never()).sendMessage(any(BinaryMessage.class));
    }

    @Test
    void broadcastScreenFrame_removesErroredSessions() throws IOException {
        when(session.isOpen()).thenReturn(true);
        doThrow(new IOException("test error")).when(session).sendMessage(any(BinaryMessage.class));

        sessionManager.addSession(session);
        assertEquals(1, sessionManager.getSessionCount());

        sessionManager.broadcastScreenFrame(new byte[]{0x01});
        assertEquals(0, sessionManager.getSessionCount());
    }
}
