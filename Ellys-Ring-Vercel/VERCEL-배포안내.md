# Elly's Ring — Vercel 배포

이 앱은 로그인 없이 바로 플래너를 엽니다. 할 일과 설정은 현재 브라우저의 `localStorage`에 저장되므로 같은 브라우저에서 계속 사용할 수 있습니다. 다른 휴대폰이나 브라우저와 자동으로 동기화되지는 않습니다. 브라우저 사이트 데이터를 지우면 저장 내용도 삭제될 수 있습니다.

## GitHub를 통해 배포

1. GitHub 저장소를 Vercel에 연결하고 Root Directory를 `package.json`과 `vercel.json`이 있는 `Ellys-Ring-Vercel` 폴더로 설정합니다.
2. Build Command는 `npm run build`, Output Directory는 `dist`로 설정합니다. 환경 변수나 데이터베이스 설정은 필요하지 않습니다.
3. 연결된 브랜치에 변경 사항을 push하면 Vercel이 새 버전을 배포합니다.

## 명령어로 배포

프로젝트 폴더에서 PowerShell을 열고 실행합니다.

```powershell
npm run build
npx vercel login
npx vercel --prod
```

`npm run build`는 배포용 정적 파일을 `dist`에 생성합니다.
