# 한국어 사전/엔그램 빌드 가이드

## 개요

`engine-core`에 코퍼스 빌드 스크립트를 추가했습니다.

- 입력: `packages/engine-core/corpus/raw/**/*.txt|jsonl|md`
- 출력:
  - `packages/engine-core/corpus/generated/dict_large.txt`
  - `packages/engine-core/corpus/generated/ngram_large.jsonl`
  - `packages/engine-core/corpus/generated/report.json`
  - `packages/engine-core/corpus/generated/report.md`

## 실행

루트에서 실행:

```bat
pnpm --filter @lab/engine-core corpus:build
```

2번/4번 데이터 자동 수집 후 빌드:

```bat
cd packages\engine-core
python scripts\collect_data_2_4.py --aihub-max-lines=120000 --opus-max-lines=120000
cd ..\..
pnpm --filter @lab/engine-core corpus:build -- --min-word-freq=5 --top-pair-per-prev=20
```

수집 메타데이터:
- `packages/engine-core/corpus/raw/sources_2_4.json`

파라미터 예시:

```bat
pnpm --filter @lab/engine-core corpus:build -- --input=corpus/raw --out=corpus/generated --min-word-freq=3 --max-dict-words=300000 --top-pair-per-prev=20
```

## 추천 학습 데이터

1. Korean Wikipedia Dump
- 장점: 공개/정제 용이/문어체 안정
- 링크: `https://dumps.wikimedia.org/kowiki/`

2. AI Hub 한국어 말뭉치
- 장점: 품질 우수, 도메인 다양
- 주의: 일부 데이터는 신청/승인 필요
- 링크: `https://aihub.or.kr`

3. CC-100 한국어
- 장점: 대용량
- 주의: 웹 노이즈 제거 필수
- 링크: `https://data.statmt.org/cc-100/`

4. OPUS OpenSubtitles
- 장점: 대화체 보강
- 링크: `https://opus.nlpl.eu/`

## 권장 파이프라인

1. 원문 수집: `raw/`에 데이터 파일 적재
2. 정제/토큰화: `corpus:build` 실행
3. 품질 점검: `report.json`에서 상위 토큰/쌍 확인
4. 엔진 반영:
- `dict_large.txt` 로드
- `ngram_large.jsonl` 로드

## 출력 포맷

- `dict_large.txt`: 단어 1줄 1개 (빈도순)
- `ngram_large.jsonl`: `prev<TAB>next` 1줄 1쌍
