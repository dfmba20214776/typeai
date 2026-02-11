# Test UI 수동 확인

## 1) 전체 단위/통합 테스트

```bat
scripts\run-tests.cmd
```

## 2) UI 직접 실행

```bat
scripts\run-ui.cmd
```

브라우저에서 아래 주소를 열어 확인합니다.

- `http://localhost:3000`
- 이미 3000을 다른 프로세스가 사용 중이면 콘솔에 대체 포트(예: 3001)가 출력됩니다.

## 3) 수동 체크리스트

- `he` 입력 시 ghost/suggestions가 즉시 표시되는지
- `Tab` 시 prefix 완성(`complete_word`)이 적용되는지
- `오늘은 ` 입력 후 `Tab` 시 next word(`next_word`)가 적용되는지
- 조합 이벤트 중(preedit) Debug 패널의 `preedit` 값이 반영되는지
- `Tab` 수락 이후 동일 prefix 추천 순위가 변하는지(MRU 반영)

## 4) E2E 실행

```bat
scripts\run-e2e.cmd
```

참고: PowerShell execution policy 때문에 `pnpm` 대신 `pnpm.cmd` 기반 스크립트를 사용합니다.
