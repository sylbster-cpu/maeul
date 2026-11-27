// 개인 집과 같은 Firebase 프로젝트·익명 인증을 사용하지만 쉼터 서비스만 돌려준다.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { withOnlineTimeout, SDK_BLOCKED } from './online-data.js';
import { createShelterService } from './shelter-service.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.4.0';
let connecting = null;
export function getShelterService() {
  if (!FIREBASE_CONFIG) return Promise.reject(new Error('쉼터 온라인 설정이 아직 없습니다'));
  if (!connecting) {
    connecting = withOnlineTimeout((async () => {
      const [appSdk, authSdk, storeSdk] = await Promise.all([
        import(SDK + '/firebase-app.js'), import(SDK + '/firebase-auth.js'), import(SDK + '/firebase-firestore.js'),
      ]).catch(() => { throw new Error(SDK_BLOCKED); });
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
      const auth = authSdk.getAuth(app);
      await auth.authStateReady();
      if (!auth.currentUser) await authSdk.signInAnonymously(auth);
      return createShelterService({ uid: auth.currentUser?.uid, db: storeSdk.getFirestore(app), api: storeSdk });
    })(), 20000).catch(error => { connecting = null; throw error; });
  }
  return connecting;
}
