# GramTrust AI Work Verification

This standalone Python service uses CLIP to compare a project description and
construction-stage prompts with a site/project image. Its image-text
similarities are experimental and are not validated construction completion
percentages.

## Requirements

- Python 3.10 or newer. Python 3.10 or 3.11 is recommended.
- Windows PowerShell for the commands below.

Python was unavailable in the repository inspection environment. Verify
whether it is installed on your machine:

```powershell
python --version
```

If that command is not found, install Python 3.10 or newer and enable the
Python launcher/PATH option before continuing.

## Create and activate a virtual environment

From the repository root:

```powershell
cd backend\ai\work-verification
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation because of the current execution policy, allow
activation for this PowerShell process and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Install packages

With the virtual environment active:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Start the service

Run this with the virtual environment active and the current directory set to
`backend\ai\work-verification`:

```powershell
uvicorn app:app --host 0.0.0.0 --port 8001
```

The first startup downloads the `openai/clip-vit-base-patch32` model and
processor from Hugging Face if they are not already cached. This requires
network access and enough disk space and memory. Model-loading failures stop
application startup with an error rather than reporting the service as
available.

## Health check

With the service running, open
`http://localhost:8001/health` or query it from PowerShell:

```powershell
Invoke-RestMethod http://localhost:8001/health
```

Example response when running on CPU:

```json
{
  "status": "ok",
  "service": "gramtrust-ai-work-verification",
  "model": "openai/clip-vit-base-patch32",
  "device": "cpu"
}
```

## Analyze an image

`POST /analyze` accepts a multipart form containing an `image` file and a
`project_description` text field. For example, from PowerShell:

```powershell
curl.exe -X POST http://localhost:8001/analyze `
  -F "image=@.\test-road.jpg" `
  -F "project_description=Construction of a rural road"
```

The response includes the model, the project-description and five
construction-stage similarity scores, the highest-alignment stage, a result,
reason, and details. Valid analyses return `REVIEW_REQUIRED` because this
prototype is not a validated construction-completion assessment.

## CPU and GPU

The service automatically selects CUDA when PyTorch detects an available
CUDA-capable GPU. Otherwise, it loads and runs on CPU. CPU is supported as the
default fallback; installing a CUDA-enabled PyTorch build is only necessary
when GPU acceleration is desired and supported by the machine.

## Current scope

The service provides health reporting and the experimental multipart analysis
endpoint. The model and processor load once during application startup.
Similarity scores do not prove project completion and must not be interpreted
as a construction completion percentage.
uvicorn app:app --host 0.0.0.0 --port 8001