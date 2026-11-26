# Story 31.8 (AD-30): Amazon Transcribe for the voice input of Epic 31. The api starts one batch
# job per recorded audio (pt-BR, the object in the files bucket, the custom vocabulary below) and
# reads the transcript from the URI the job answers; the job's output is kept by the service, not
# in our bucket. Nothing here is paid until STT_PROVIDER is `transcribe` (variables.tf stt_provider,
# `fake` by default): a vocabulary and an IAM policy cost nothing.
#
# Region: the bucket and Bedrock are us-east-1 (locals.tf); Transcribe supports pt-BR there and a job
# must run in the bucket's region, so the api calls us-east-1 (`TRANSCRIBE_REGION`).
#
# S3 read: the job is started without a data-access role, so Transcribe reads the audio with the
# caller's own rights. The task role already holds s3:GetObject on this bucket (iam.tf
# `files-bucket`), so no S3 statement is added here.

locals {
  # Words from the seed's equipment and instrument vocabulary (transcribe-vocabulary.txt, one entry
  # per line, lowercase letters with accents and hyphens only: the pt-BR custom vocabulary rules);
  # blank lines and # comments are ignored.
  transcribe_vocabulary = [
    for line in split("\n", file("${path.module}/transcribe-vocabulary.txt")) : trimspace(line)
    if trimspace(line) != "" && !startswith(trimspace(line), "#")
  ]
}

resource "aws_transcribe_vocabulary" "trade_words" {
  vocabulary_name = "${local.name}-trade-words"
  language_code   = "pt-BR"
  phrases         = local.transcribe_vocabulary
}

resource "aws_iam_role_policy" "app_transcribe" {
  name = "transcribe-jobs"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Start and poll the api's own jobs only (names are fasor-stt-*), with this vocabulary only.
        Sid    = "StartAndReadTranscriptionJobs"
        Effect = "Allow"
        Action = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
        Resource = [
          "arn:aws:transcribe:${local.region}:${var.account_id}:transcription-job/fasor-stt-*",
          aws_transcribe_vocabulary.trade_words.arn,
        ]
      },
    ]
  })
}
