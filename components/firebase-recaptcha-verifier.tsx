/**
 * Firebase phone-auth reCAPTCHA verifier — native-only (unused on web).
 *
 * Replaces expo-firebase-recaptcha, which is unmaintained and can't build on
 * current Android tooling (its dependency expo-firebase-core's build.gradle
 * uses a Gradle Jar API removed in current Android Gradle Plugin versions —
 * "Could not set unknown property 'classifier'").
 *
 * expo-firebase-recaptcha itself has no real native code for this feature —
 * it's a WebView loading an HTML page that runs Firebase's own JS SDK
 * (loaded from Google's CDN, isolated from this app's bundled Firebase SDK)
 * to render the reCAPTCHA widget, then bridges the resulting token back via
 * postMessage. This component reimplements exactly that, using only
 * react-native-webview (already a real, working dependency here).
 */
import { CodedError } from 'expo-modules-core';
import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { Button, Modal, SafeAreaView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

type RNWebViewMessageEvent = { nativeEvent: { data: string } };

interface FirebaseRecaptchaVerifierModalProps {
  firebaseConfig: Record<string, any>;
  firebaseVersion?: string;
  attemptInvisibleVerification?: boolean;
  appVerificationDisabledForTesting?: boolean;
  languageCode?: string;
  title?: string;
  cancelLabel?: string;
}

export interface FirebaseRecaptchaVerifierHandle {
  type: 'recaptcha';
  verify: () => Promise<string>;
}

function getWebviewHtml(
  firebaseConfig: Record<string, any>,
  firebaseVersion: string,
  appVerificationDisabledForTesting: boolean,
  languageCode: string | undefined,
  invisible: boolean,
) {
  return `
<!DOCTYPE html><html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <script src="https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-auth.js"></script>
  <script type="text/javascript">firebase.initializeApp(${JSON.stringify(firebaseConfig)});</script>
  <style>
    html, body { height: 100%; ${invisible ? 'padding: 0; margin: 0;' : ''} }
    #recaptcha-btn { width: 100%; height: 100%; padding: 0; margin: 0; border: 0; }
  </style>
</head>
<body>
  ${invisible
    ? '<button id="recaptcha-btn" type="button" onclick="onClickButton()">Confirm reCAPTCHA</button>'
    : '<div id="recaptcha-cont" class="g-recaptcha"></div>'}
  <script>
    var fullChallengeTimer;
    function onVerify(token) {
      if (fullChallengeTimer) { clearInterval(fullChallengeTimer); fullChallengeTimer = undefined; }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'verify', token: token }));
    }
    function onLoad() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'load' }));
      firebase.auth().settings.appVerificationDisabledForTesting = ${appVerificationDisabledForTesting};
      ${languageCode ? `firebase.auth().languageCode = '${languageCode}';` : ''}
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("${invisible ? 'recaptcha-btn' : 'recaptcha-cont'}", {
        size: "${invisible ? 'invisible' : 'normal'}",
        callback: onVerify
      });
      window.recaptchaVerifier.render();
    }
    function onError() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
    }
    function onClickButton() {
      if (!fullChallengeTimer) {
        fullChallengeTimer = setInterval(function() {
          var iframes = document.getElementsByTagName("iframe");
          var isFullChallenge = false;
          for (var i = 0; i < iframes.length; i++) {
            var parentWindow = iframes[i].parentNode ? iframes[i].parentNode.parentNode : undefined;
            var isHidden = parentWindow && parentWindow.style.opacity == 0;
            isFullChallenge = isFullChallenge || (
              !isHidden &&
              ((iframes[i].title === 'recaptcha challenge') ||
               (iframes[i].src.indexOf('google.com/recaptcha/api2/bframe') >= 0)));
          }
          if (isFullChallenge) {
            clearInterval(fullChallengeTimer);
            fullChallengeTimer = undefined;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fullChallenge' }));
          }
        }, 100);
      }
    }
    window.addEventListener('message', function(event) {
      if (event.data.verify) { document.getElementById('recaptcha-btn').click(); }
    });
  </script>
  <script src="https://www.google.com/recaptcha/api.js?onload=onLoad&render=explicit&hl=${languageCode ?? ''}" onerror="onError()"></script>
</body></html>`;
}

/** Fires the invisible challenge inside an already-loaded WebView. */
function triggerInvisibleVerify(webview: React.RefObject<WebView | null>) {
  webview.current?.injectJavaScript(`
    (function(){ window.dispatchEvent(new MessageEvent('message', {data: { verify: true }})); })();
    true;
  `);
}

export const FirebaseRecaptchaVerifierModal = forwardRef<
  FirebaseRecaptchaVerifierHandle,
  FirebaseRecaptchaVerifierModalProps
>(function FirebaseRecaptchaVerifierModal(
  {
    firebaseConfig,
    firebaseVersion = '8.0.0',
    attemptInvisibleVerification = false,
    appVerificationDisabledForTesting = false,
    languageCode,
    title = 'reCAPTCHA',
    cancelLabel = 'Cancel',
  },
  ref,
) {
  const invisibleWebview = useRef<WebView>(null);
  const visibleWebview = useRef<WebView>(null);
  const [visible, setVisible] = useState(false);
  const [visibleLoaded, setVisibleLoaded] = useState(false);
  const [invisibleLoaded, setInvisibleLoaded] = useState(false);
  const pending = useRef<{ resolve: (token: string) => void; reject: (err: Error) => void } | null>(null);

  const cancel = useCallback(() => {
    pending.current?.reject(new CodedError('ERR_FIREBASE_RECAPTCHA_CANCEL', 'Cancelled by user'));
    pending.current = null;
    setVisible(false);
  }, []);

  const onError = useCallback(() => {
    pending.current?.reject(new CodedError('ERR_FIREBASE_RECAPTCHA_ERROR', 'Failed to load reCAPTCHA'));
    pending.current = null;
    setVisible(false);
  }, []);

  const onVerify = useCallback((token: string) => {
    pending.current?.resolve(token);
    pending.current = null;
    setVisible(false);
  }, []);

  const onFullChallenge = useCallback(() => {
    setVisible(true);
  }, []);

  const handleMessage = useCallback(
    (onFirstLoad: () => void) => (event: RNWebViewMessageEvent) => {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'load':
          onFirstLoad();
          break;
        case 'error':
          onError();
          break;
        case 'verify':
          onVerify(data.token);
          break;
        case 'fullChallenge':
          onFullChallenge();
          break;
      }
    },
    [onError, onVerify, onFullChallenge],
  );

  useImperativeHandle(
    ref,
    () => ({
      type: 'recaptcha' as const,
      verify: () =>
        new Promise<string>((resolve, reject) => {
          pending.current = { resolve, reject };
          if (attemptInvisibleVerification) {
            if (invisibleLoaded) triggerInvisibleVerify(invisibleWebview);
          } else {
            setVisibleLoaded(false);
            setVisible(true);
          }
        }),
    }),
    [attemptInvisibleVerification, invisibleLoaded],
  );

  return (
    <View style={styles.container}>
      {attemptInvisibleVerification && (
        <WebView
          ref={invisibleWebview}
          style={styles.invisible}
          javaScriptEnabled
          mixedContentMode="always"
          source={{
            baseUrl: `https://${firebaseConfig.authDomain}`,
            html: getWebviewHtml(firebaseConfig, firebaseVersion, appVerificationDisabledForTesting, languageCode, true),
          }}
          onError={onError}
          onMessage={handleMessage(() => setInvisibleLoaded(true))}
        />
      )}

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.cancel}>
              <Button title={cancelLabel} onPress={cancel} />
            </View>
          </View>
          <View style={styles.content}>
            <WebView
              ref={visibleWebview}
              style={styles.content}
              javaScriptEnabled
              mixedContentMode="always"
              source={{
                baseUrl: `https://${firebaseConfig.authDomain}`,
                html: getWebviewHtml(firebaseConfig, firebaseVersion, appVerificationDisabledForTesting, languageCode, false),
              }}
              onError={onError}
              onMessage={handleMessage(() => setVisibleLoaded(true))}
            />
            {!visibleLoaded && (
              <View style={styles.loader}>
                <ActivityIndicator size="large" />
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: 0, height: 0 },
  invisible: { width: 300, height: 300 },
  modalContainer: { flex: 1 },
  header: {
    backgroundColor: '#FBFBFB',
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomColor: '#CECECE',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { position: 'absolute', left: 8, justifyContent: 'center' },
  title: { fontWeight: 'bold' },
  content: { flex: 1 },
  loader: { ...StyleSheet.absoluteFillObject, paddingTop: 20, justifyContent: 'flex-start', alignItems: 'center' },
});
