// Firebase 설정이 있어야만 CDN SDK를 불러온다. 설정 전에는 기존 게임 동작을 변경하지 않는다.
// 게임 엔진은 Three.js 그대로 두고 온라인 방문 집/방명록에만 Firestore를 사용한다.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { createOnlineService } from './online-service.js';
import { withOnlineTimeout, SDK_BLOCKED } from './online-data.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.4.0';
// 서버 응답을 기다리는 한도(밀리초). Firestore 의 쓰기는 연결이 끊긴 동안 실패하지 않고 계속 기다리므로,
// 한도가 없으면 창과 불러오는 화면이 끝없이 멈춘다.
export const ONLINE_TIMEOUT_MS = 20000;
export function isOnlineConfigured() {
  return !!FIREBASE_CONFIG && ['apiKey', 'authDomain', 'projectId', 'appId'].every(
    (key) => typeof FIREBASE_CONFIG[key] === 'string' && FIREBASE_CONFIG[key].length > 3);
}

let connection = null;
export function getOnlineService() {
  if (!isOnlineConfigured()) {
    return Promise.reject(new Error('온라인 기능은 Firebase 설정 후 사용할 수 있습니다'));
  }
  if (!connection) {
    // 모듈 내려받기나 로그인이 멈추면 한도 뒤에 실패로 돌리고, 다음 시도에서 다시 연결한다
    connection = withOnlineTimeout((async () => {
      const [appSdk, authSdk, storeSdk] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]).catch(() => {
        // Claude 미리 보기 주소처럼 바깥 스크립트를 막는 곳이거나 인터넷이 끊긴 경우다
        throw Object.assign(new Error(SDK_BLOCKED), { code: 'online/sdk-blocked' });
      });
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
      const auth = authSdk.getAuth(app);
      await auth.authStateReady();
      if (!auth.currentUser) await authSdk.signInAnonymously(auth);
      const uid = auth.currentUser?.uid;
      return createOnlineService({ uid, db: storeSdk.getFirestore(app), api: storeSdk });
    })(), ONLINE_TIMEOUT_MS).catch((error) => { connection = null; throw error; });
  }
  return connection;
}
