# Elly's Ring — Vercel 배포

현재 Vercel 배포는 로그인·회원가입 화면만 표시합니다. 정적 화면에는 로그인 API와 영구 데이터베이스가 포함되어 있지 않아 계정 인증과 기기 간 동기화는 아직 동작하지 않습니다. 로컬 `npm start`는 기존 파일 저장 계정 기능을 사용합니다.

## GitHub를 통해 배포

1. 이 프로젝트를 GitHub 저장소에 올립니다. `.data`, `.env`, `node_modules`는 올리지 마세요. `.gitignore`에 제외되어 있습니다. GitHub 웹에서 파일을 직접 업로드할 때는 제외 규칙이 적용되지 않으므로 이 폴더들을 직접 빼세요.
2. [Vercel](https://vercel.com/new)에 로그인하고 **Add New → Project**에서 저장소를 Import합니다.
3. **Root Directory**는 `package.json`과 `vercel.json`이 있는 폴더를 선택합니다. 이 폴더 자체를 저장소 루트로 올렸다면 기본값을 사용합니다.
4. 다음 설정을 확인하고 **Deploy**를 누릅니다. `vercel.json`에도 같은 설정이 들어 있습니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Other |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | 기본값 |
| Environment Variables | 미리보기에는 필요 없음 |

5. 배포가 성공하면 Vercel이 표시하는 실제 `https://…vercel.app` 주소를 열고 모바일에서도 같은 주소를 사용합니다. 저장소의 연결된 배포 브랜치에 변경 사항을 push하면 다시 배포됩니다.

## GitHub 없이 명령어로 배포

이 프로젝트 폴더에서 PowerShell을 엽니다.

```powershell
npm run build
npx vercel login
npx vercel --prod
```

Vercel CLI가 계정·프로젝트를 물으면 본인의 계정을 선택하고 새 프로젝트 이름을 입력합니다. 현재 폴더를 프로젝트 경로로 지정합니다. `.vercelignore`는 로컬 계정 데이터와 원본 미디어·영상 내보내기 파일을 업로드 대상에서 제외합니다.

`dist`에는 공개 웹 화면, JavaScript, Monda 폰트, 비둘기 애니메이션만 생성됩니다. `npm run build`는 원본 앱이나 `.data`를 바꾸지 않습니다.

## 로그인까지 운영하려면

현재 `server.cjs`는 `.data` 파일에 계정과 계획을 저장하고 서버 메모리에 로그인 세션을 저장합니다. 이 방식은 여러 Vercel 함수 인스턴스 사이에서 유지되는 저장소가 아니므로 그대로 이식할 수 없습니다.

계정 기능까지 배포하려면 `/api/me`, `/api/signup`, `/api/login`, `/api/logout`, `/api/data`를 Vercel Functions로 구현하고, 계정·계획·세션을 외부 영구 데이터베이스 또는 인증 서비스에 연결해야 합니다. 데이터베이스 연결 값은 Vercel의 Environment Variables에 설정합니다. 현재 빌드는 로그인 화면을 그대로 배포하며, API와 영구 데이터베이스를 연결한 뒤 실제 로그인을 사용할 수 있습니다. `SITE_ORIGIN`과 `COOKIE_SECURE`만 설정하는 것으로 현재 파일 저장 서버가 Vercel용 서버가 되지는 않습니다.

공식 문서: [Git 배포](https://vercel.com/docs/git), [프로젝트 설정](https://vercel.com/docs/project-configuration), [함수 파일과 저장소](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions).
