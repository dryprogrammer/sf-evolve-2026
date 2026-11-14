# Browser evidence — actual local fixture behavior

Captured from the integrated branch, using an isolated local preview store on port 3000. One operator selected fictional roles. The policy mutation is simulated; the server rejection is real. The clip demonstrates setup, a separately attributed Finance clarification, explicit required sign-off, changed evidence and rejected approval. It is a raw screen capture, not a narrated/edited final submission video; no claim of independent human review, deployment or public submission.

[recording-e2b03e4044a741eabae42faabbe34ffa.mp4](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/repro-evidence/e9b69b39-3b41-45f2-9bee-e3cbe64e3724)

![screenshot-73b23d55a35148e6b23947c8dd49f8c6.png](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/repro-evidence/e07eb3ff-9e95-4f5c-8a09-2a092d115e26)

[Full workshop and caption view](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/repro-evidence/041f28f6-4cb9-4a14-80ad-611ffbcdb9b4)

The browser extension emitted recorder HTTP 404 diagnostics; they were not application errors and did not prevent the completed screenshot/video uploads. The application returned `409 changed_evidence` for the deliberately stale approval. Automated browser coverage separately proves new-round/fresh-sign-off recovery, persistence, privacy, caption fallback and mobile layout.

Final verification records identify the tested Git revision, commands, exit codes, logs and source hashes. A later documentation/evidence-only commit does not change the tested application source. Retest if code, dependencies, configuration or tests change.
