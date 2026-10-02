# Elly's Ring — Vercel 배포

Vercel 배포는 아이디 로그인, 이메일 회원가입, Supabase 데이터 저장을 사용합니다. Supabase 프로젝트를 만들고 아래 환경 변수를 Vercel에 입력해야 계정 인증과 기기 간 동기화가 동작합니다. 로컬 `npm start`는 기존 파일 저장 계정 기능을 사용합니다.

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
| Environment Variables | 아래 Supabase 연결값 필요 |

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

## Supabase 무료 아이디 로그인과 저장소 연결

Supabase Free는 현재 월 $0이며 500 MB 데이터베이스, 월 50,000 활성 사용자, 5 GB 비캐시 전송량과 5 GB 캐시 전송량을 포함합니다. 무료 프로젝트는 활동이 적으면 7일 뒤 일시 정지될 수 있습니다. 자세한 한도는 [Supabase 요금표](https://supabase.com/pricing)를 확인하세요.

1. [Supabase](https://supabase.com/dashboard)에서 무료 프로젝트를 만듭니다.
2. 프로젝트의 **SQL Editor**에서 `supabase/setup.sql` 전체를 실행합니다. 플래너 데이터는 사용자별 RLS 정책으로 보호하고, 아이디 연결표는 Vercel 서버만 읽고 쓰도록 잠급니다.
3. **Authentication → URL Configuration**의 Site URL을 `https://ellyring.vercel.app`로 설정합니다. 이메일 확인을 쓸 경우 확인 링크가 앱으로 돌아오도록 Redirect URLs에도 이 주소를 추가합니다.
4. **Project Settings → API Keys**에서 Project URL, **Publishable key**, 그리고 서버용 **service_role** 키를 준비합니다. service_role 키는 관리자 권한이 있으므로 Vercel 환경 변수에만 보관하고 웹 앱이나 GitHub에 넣지 마세요.
5. Vercel의 `ellyring` 프로젝트에서 **Settings → Environment Variables**에 다음 값을 추가하고 Production 환경을 선택합니다. Preview 배포에서도 시험하려면 Preview 환경에도 추가합니다.

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key — 서버 전용, 비밀 값 |

6. 최신 `main`을 다시 배포합니다. 로그인 API는 저장소의 `api/account.js`에서 실행되고, 플래너 데이터는 브라우저의 Supabase 요청과 RLS로 보호됩니다. 빌드가 Publishable key만 공개 설정 파일에 넣습니다. service_role 키는 서버 API에서만 사용합니다. 앱은 비밀번호를 자체 DB에 저장하지 않습니다.

회원가입 때 아이디(3–24자 영문 소문자·숫자·밑줄), 이름, 이메일, 비밀번호를 받습니다. 로그인 화면에는 아이디와 비밀번호만 표시하며, 이메일 확인을 켜 둔 프로젝트에서는 확인 메일을 승인한 뒤 로그인해야 합니다.

기존 이메일 계정은 아이디 연결 정보가 없으므로 자동 로그인되지 않습니다. 이 업데이트 후 새 계정을 만들거나, 기존 계정은 사용자 테이블에 아이디 연결을 별도로 추가해야 합니다.

공식 문서: [Supabase 요금표](https://supabase.com/pricing), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel Functions](https://vercel.com/docs/functions), [Vercel 환경 변수](https://vercel.com/docs/projects/environment-variables).
