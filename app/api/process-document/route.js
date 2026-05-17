import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const OLLAMA_API_URL = 'http://localhost:11434/api/generate';

const VALID_STATUSES = new Set([
  'AWAITING_INGESTION',
  'AUTO_APPROVED',
  'FLAGGED_FOR_REVIEW',
  'COMMITTED',
  'ARCHIVED',
]);

const VALID_PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);

function apiError(status, stage, message, details) {
  return NextResponse.json(
    { error: message, stage, ...(details ? { details } : {}) },
    { status }
  );
}

function parseOllamaJson(responseText) {
  const trimmed = responseText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

function normalizeAiOutput(raw) {
  const status = String(raw?.status ?? '').toUpperCase();
  const priority = String(raw?.priority ?? '').toUpperCase();
  const confidenceScore = Number(raw?.confidenceScore);

  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      `Invalid status "${raw?.status}". Expected one of: ${[...VALID_STATUSES].join(', ')}`
    );
  }

  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error(
      `Invalid priority "${raw?.priority}". Expected one of: ${[...VALID_PRIORITIES].join(', ')}`
    );
  }

  if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1) {
    throw new Error(
      `Invalid confidenceScore "${raw?.confidenceScore}". Expected a number between 0 and 1.`
    );
  }

  return { status, priority, confidenceScore };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { documentText, documentType } = body;

    if (!documentText) {
      return apiError(400, 'validation', 'Document text content is required.');
    }

    const startTime = Date.now();

    const aiSystemPrompt = `
    You are an automated document parsing engine for a healthcare workflow system.
    Analyze the following document and output STRICTLY a single valid JSON object. 
    Do not include markdown formatting, backticks, or any conversational text.

    Analyze for:
    1. Criticality: If 'bleed', 'complication', 'urgent', or 'critical' appear, set status to 'FLAGGED_FOR_REVIEW' and priority to 'HIGH'. Otherwise 'AUTO_APPROVED' and 'NORMAL'.
    2. Confidence Score: Estimate your extraction accuracy as a float between 0.75 and 0.99.

    Format to return:
    {
      "status": "AUTO_APPROVED" or "FLAGGED_FOR_REVIEW",
      "confidenceScore": 0.92,
      "priority": "NORMAL" or "HIGH"
    }

    Document Content:
    "${documentText.replace(/"/g, '\\"')}"
    `;

    let ollamaResponse;
    try {
      ollamaResponse = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          prompt: aiSystemPrompt,
          stream: false,
        }),
      });
    } catch (fetchError) {
      return apiError(
        502,
        'ollama',
        'Could not reach Ollama at http://localhost:11434.',
        fetchError.message
      );
    }

    if (!ollamaResponse.ok) {
      const bodyText = await ollamaResponse.text();
      return apiError(
        502,
        'ollama',
        `Ollama request failed (${ollamaResponse.status}).`,
        bodyText.slice(0, 300)
      );
    }

    const rawData = await ollamaResponse.json();

    if (!rawData?.response) {
      return apiError(
        502,
        'ollama',
        'Ollama returned an empty response.',
        JSON.stringify(rawData).slice(0, 300)
      );
    }

    let cleanJson;
    try {
      cleanJson = normalizeAiOutput(parseOllamaJson(rawData.response));
    } catch (parseError) {
      return apiError(
        422,
        'ai_parse',
        'Could not parse a valid workflow JSON object from the model.',
        parseError.message
      );
    }

    const processingTime = Date.now() - startTime;

    const dbTransactionRecord = await prisma.$transaction(async (tx) => {
      const savedDoc = await tx.document.create({
        data: {
          rawText: documentText,
          docType: documentType || 'Clinical Summary Log',
        },
      });

      await tx.pipelineTelemetry.create({
        data: {
          documentId: savedDoc.id,
          confidenceScore: cleanJson.confidenceScore,
          wordCount: documentText.split(/\s+/).length,
          processingMs: processingTime,
          modelVersion: 'llama3:latest',
        },
      });

      const savedMatrix = await tx.verificationMatrix.create({
        data: {
          documentId: savedDoc.id,
          systemStatus: cleanJson.status,
          priorityLevel: cleanJson.priority,
        },
      });

      await tx.auditLog.create({
        data: {
          documentId: savedDoc.id,
          action: 'INGESTION_PIPELINE_COMPLETE',
          performedBy: 'LLAMA3_PARSER_DAEMON',
          changedTo: cleanJson.status,
        },
      });

      return {
        id: savedDoc.id,
        timestamp: savedDoc.createdAt,
        type: savedDoc.docType,
        status: savedMatrix.systemStatus,
        priority: savedMatrix.priorityLevel,
        confidenceScore: cleanJson.confidenceScore,
        wordCount: documentText.split(/\s+/).length,
        processingMs: processingTime,
      };
    });

    return NextResponse.json(dbTransactionRecord, { status: 200 });
  } catch (error) {
    console.error('Ingestion pipeline error:', error);

    const prismaCode = error?.code;
    if (prismaCode?.startsWith('P')) {
      return apiError(
        500,
        'database',
        'Database write failed. Confirm PostgreSQL is running and migrations are applied.',
        error.message
      );
    }

    return apiError(
      500,
      'unknown',
      'An unexpected error occurred during ingestion.',
      error.message
    );
  }
}
