# Shared by infra/bin/tf, aws, check and deploy (security review 2026-09-30, I-10): the
# container CLI, the pinned AWS CLI image, the region, and the export of one profile's AWS
# login session. Sourced, never run.
# shellcheck shell=bash

# The container CLI every script runs through: $CONTAINER_CLI when set, else docker, else
# podman (an Apple silicon Mac with Podman and no Docker Desktop has no `docker`). Neither
# installed: docker, so the first call fails naming it.
container_cli() {
  if [ -n "${CONTAINER_CLI:-}" ]; then
    printf '%s' "$CONTAINER_CLI"
  elif command -v docker >/dev/null 2>&1; then
    printf docker
  elif command -v podman >/dev/null 2>&1; then
    printf podman
  else
    printf docker
  fi
}
CTR="$(container_cli)"

AWS_CLI_IMAGE=amazon/aws-cli:2.37.6
# shellcheck disable=SC2034 # read by the scripts that source this file
AWS_REGION_DEFAULT=us-east-1

# Prints the profile's session as KEY=value lines (no `export`), read by the pinned CLI
# image as the calling user, so ~/.aws never gets root-owned files.
aws_session_env() {
  local profile="$1"
  "$CTR" run --rm --user "$(id -u):$(id -g)" -e HOME=/home/aws \
    -v "$HOME/.aws:/home/aws/.aws" "$AWS_CLI_IMAGE" \
    configure export-credentials --profile "$profile" --format env-no-export
}

# aws_retry <command...> (E15-A10, batch e18fb 2026-11-03): runs the command and, when it exits
# 255 with a lost-connection message of the AWS CLI on stderr, pauses and runs it again, up to
# DEPLOY_RETRY_ATTEMPTS attempts in all (default 5) with DEPLOY_RETRY_PAUSE_S seconds between
# them (default 15). Any other failure (a waiter out of attempts, AccessDenied) returns at
# once. stdout passes through; each attempt's stderr is re-emitted after it. Only for calls
# that are safe to repeat (reads, waits, `ssm put-parameter --overwrite`), never `run-task`.
# The v0.3.0 deploy (2026-10-23) lost https://ecs.us-east-1.amazonaws.com/ during
# `ecs wait services-stable` right after the roll, and `set -e` ended it before the tag record.
AWS_RETRY_PATTERN='Could not connect to the endpoint URL|Connect timeout on endpoint URL|Read timeout on endpoint URL|Connection was closed'
aws_retry() {
  local attempts="${DEPLOY_RETRY_ATTEMPTS:-5}" pause="${DEPLOY_RETRY_PAUSE_S:-15}" attempt=1 status err
  err="$(mktemp "${TMPDIR:-/tmp}/aws-retry.XXXXXX")"
  while :; do
    status=0
    "$@" 2>"$err" || status=$?
    cat "$err" >&2
    if [ "$status" = 255 ] && [ "$attempt" -lt "$attempts" ] && grep -Eq "$AWS_RETRY_PATTERN" "$err"; then
      attempt=$((attempt + 1))
      echo "deploy: lost the AWS endpoint (exit 255); attempt $attempt of $attempts in ${pause}s" >&2
      sleep "$pause"
      continue
    fi
    rm -f "$err"
    return "$status"
  done
}
