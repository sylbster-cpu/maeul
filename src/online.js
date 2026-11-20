// Firebase 설정이 있어야만 CDN SDK를 불러온다. 설정 전에는 기존 게임 동작을 변경하지 않는다.
// 게임 엔진은 Three.js 그대로 두고 온라인 방문 집/방명록에만 Firestore를 사용한다.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { createOnlineService } from './online-service.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.4.0';
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
    connection = (async () => {
      const [appSdk, authSdk, storeSdk] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
      const auth = authSdk.getAuth(app);
      await auth.authStateReady();
      if (!auth.currentUser) await authSdk.signInAnonymously(auth);
      const uid = auth.currentUser?.uid;
      return createOnlineService({ uid, db: storeSdk.getFirestore(app), api: storeSdk });
    })().catch((error) => { connection = null; throw error; });
  }
  return connection;
}
