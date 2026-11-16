-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'COUNSELLOR', 'CLINICIAN', 'INSTITUTION_ADMIN', 'SUPPORT_STAFF', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'hi');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Profession" AS ENUM ('COUNSELLOR', 'COUNSELLING_PSYCHOLOGIST', 'CLINICAL_PSYCHOLOGIST', 'PSYCHIATRIST');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CheckInCadence" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('CORE_PROCESSING', 'CARE_TEAM_REVIEW', 'AGGREGATE_ANALYTICS');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WantsToTalk" AS ENUM ('NO', 'NOT_NOW', 'YES');

-- CreateEnum
CREATE TYPE "Instrument" AS ENUM ('PHQ9', 'GAD7');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessmentSource" AS ENUM ('SELF', 'SCHEDULED', 'COUNSELLOR_REQUEST');

-- CreateEnum
CREATE TYPE "TriageCategory" AS ENUM ('ROUTINE', 'MONITOR', 'PRIORITY', 'URGENT');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'REVIEWED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AlertDecision" AS ENUM ('NO_ACTION_NEEDED', 'OUTREACH', 'FURTHER_ASSESSMENT', 'REFERRAL', 'CRISIS_PROTOCOL');

-- CreateEnum
CREATE TYPE "ReviewerFeedback" AS ENUM ('APPROPRIATE', 'NOT_NEEDED', 'UNDER_TRIAGED');

-- CreateEnum
CREATE TYPE "HelpRequestType" AS ENUM ('GENERAL_SUPPORT', 'ACADEMIC_STRESS', 'ANXIETY', 'COUNSELLING_APPOINTMENT', 'PSYCHIATRIC_CONSULTATION', 'URGENT_SUPPORT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'ACTIVE', 'MONITORING', 'CLOSED');

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('ALERT', 'HELP_REQUEST', 'COUNSELLOR');

-- CreateEnum
CREATE TYPE "ReferralService" AS ENUM ('CAMPUS_COUNSELLING', 'CLINICAL_PSYCHOLOGY', 'PSYCHIATRY', 'EXTERNAL_SERVICE');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('CREATED', 'BOOKED', 'ATTENDED', 'NOT_ATTENDED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('VIDEO', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'DONE', 'MISSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "mfaSecretCt" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "mfaLastCounter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "profession" "Profession" NOT NULL,
    "qualifications" TEXT NOT NULL,
    "registrationBody" TEXT,
    "registrationNumber" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "specialisations" TEXT[],
    "languages" TEXT[],
    "feeInr" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT NOT NULL,
    "offersVideo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProfessionalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionConfiguration" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "checkInCadence" "CheckInCadence" NOT NULL DEFAULT 'WEEKLY',
    "minCohortSize" INTEGER NOT NULL DEFAULT 10,
    "careTeamHours" TEXT NOT NULL,
    "crisisContacts" JSONB NOT NULL,
    "onCallResponderId" TEXT,
    "urgentAckMinutes" INTEGER NOT NULL DEFAULT 15,
    "priorityAckHours" INTEGER NOT NULL DEFAULT 24,
    "monitorAckHours" INTEGER NOT NULL DEFAULT 72,
    "retentionMonths" INTEGER NOT NULL DEFAULT 36,
    "riskRules" JSONB NOT NULL,
    "riskRulesVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "InstitutionConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentPolicy" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "decision" "ConsentDecision" NOT NULL,
    "locale" "Locale" NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mood" INTEGER,
    "stress" INTEGER,
    "sleep" INTEGER,
    "energy" INTEGER,
    "social" INTEGER,
    "academicPressure" INTEGER,
    "wantsToTalk" "WantsToTalk",
    "noteCiphertext" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'en',

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "instrument" "Instrument" NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "source" "AssessmentSource" NOT NULL,
    "requestedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "requestedLocale" "Locale" NOT NULL DEFAULT 'en',
    "displayedLocale" "Locale",

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResponse" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "AssessmentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentScore" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "safetyItemPositive" BOOLEAN NOT NULL DEFAULT false,
    "functionalDifficulty" INTEGER,
    "scoringVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "category" "TriageCategory" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "decision" "AlertDecision",
    "decisionNoteCt" TEXT,
    "reviewerFeedback" "ReviewerFeedback",
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskIndicator" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "category" "TriageCategory" NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "fromCategory" "TriageCategory",
    "toCategory" "TriageCategory",
    "note" TEXT,
    "noteCt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationAttempt" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetLabel" TEXT,
    "channel" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL,
    "noteCt" TEXT,
    "recordedById" TEXT,

    CONSTRAINT "EscalationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpRequest" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "HelpRequestType" NOT NULL,
    "detailsCt" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'help_form',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" TEXT,

    CONSTRAINT "HelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TriageCategory" NOT NULL,
    "source" "CaseSource" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "arrangedAt" TIMESTAMP(3),
    "referredAt" TIMESTAMP(3),
    "appointmentUpdatedAt" TIMESTAMP(3),
    "followUpScheduledAt" TIMESTAMP(3),
    "outcomeDocumentedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "returnedToMonitoringAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "outcomeNoteCt" TEXT,
    "missedConcern" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAssignment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CaseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAlert" (
    "caseId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAlert_pkey" PRIMARY KEY ("caseId","alertId")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detailCt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "service" "ReferralService" NOT NULL,
    "professionalId" TEXT,
    "reasonCt" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" "ConsultationMode" NOT NULL DEFAULT 'VIDEO',
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "appointmentId" TEXT,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "referralId" TEXT,
    "slotId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" "ConsultationMode" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "rescheduledFromId" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "studentJoinedAt" TIMESTAMP(3),
    "clinicianJoinedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "consultationId" TEXT,
    "kind" TEXT NOT NULL,
    "bodyCt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "caseId" TEXT,
    "appointmentId" TEXT,
    "studentId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "outcomeCt" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "bodyCt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "userId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "link" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Department_institutionId_code_key" ON "Department"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_institutionId_role_idx" ON "User"("institutionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_userId_idx" ON "AccessToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE INDEX "StudentProfile_institutionId_departmentId_idx" ON "StudentProfile"("institutionId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_institutionId_studentNumber_key" ON "StudentProfile"("institutionId", "studentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalProfile_userId_key" ON "ProfessionalProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionConfiguration_institutionId_key" ON "InstitutionConfiguration"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentPolicy_version_key" ON "ConsentPolicy"("version");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_scope_recordedAt_idx" ON "ConsentRecord"("userId", "scope", "recordedAt");

-- CreateIndex
CREATE INDEX "CheckIn_institutionId_studentId_createdAt_idx" ON "CheckIn"("institutionId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_institutionId_studentId_completedAt_idx" ON "Assessment"("institutionId", "studentId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResponse_assessmentId_itemNumber_key" ON "AssessmentResponse"("assessmentId", "itemNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentScore_assessmentId_key" ON "AssessmentScore"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_reference_key" ON "Alert"("reference");

-- CreateIndex
CREATE INDEX "Alert_institutionId_status_category_idx" ON "Alert"("institutionId", "status", "category");

-- CreateIndex
CREATE INDEX "Alert_institutionId_studentId_idx" ON "Alert"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "RiskIndicator_institutionId_studentId_ruleCode_idx" ON "RiskIndicator"("institutionId", "studentId", "ruleCode");

-- CreateIndex
CREATE INDEX "RiskIndicator_studentId_dedupeKey_idx" ON "RiskIndicator"("studentId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AlertEvent_alertId_createdAt_idx" ON "AlertEvent"("alertId", "createdAt");

-- CreateIndex
CREATE INDEX "EscalationAttempt_alertId_attemptedAt_idx" ON "EscalationAttempt"("alertId", "attemptedAt");

-- CreateIndex
CREATE INDEX "HelpRequest_institutionId_studentId_createdAt_idx" ON "HelpRequest"("institutionId", "studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Case_reference_key" ON "Case"("reference");

-- CreateIndex
CREATE INDEX "Case_institutionId_status_priority_idx" ON "Case"("institutionId", "status", "priority");

-- CreateIndex
CREATE INDEX "Case_institutionId_studentId_idx" ON "Case"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "CaseAssignment_userId_endedAt_idx" ON "CaseAssignment"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_institutionId_studentId_status_idx" ON "Referral"("institutionId", "studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_appointmentId_key" ON "AvailabilitySlot"("appointmentId");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_institutionId_status_startsAt_idx" ON "AvailabilitySlot"("institutionId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_professionalId_startsAt_key" ON "AvailabilitySlot"("professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_institutionId_studentId_startsAt_idx" ON "Appointment"("institutionId", "studentId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_institutionId_professionalId_startsAt_idx" ON "Appointment"("institutionId", "professionalId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");

-- CreateIndex
CREATE INDEX "ClinicalNote_institutionId_studentId_createdAt_idx" ON "ClinicalNote"("institutionId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUp_institutionId_assignedToId_status_dueAt_idx" ON "FollowUp"("institutionId", "assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Message_caseId_createdAt_idx" ON "Message"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_chain_createdAt_idx" ON "AuditLog"("chain", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_chain_seq_key" ON "AuditLog"("chain", "seq");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalProfile" ADD CONSTRAINT "ProfessionalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionConfiguration" ADD CONSTRAINT "InstitutionConfiguration_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_policyVersion_fkey" FOREIGN KEY ("policyVersion") REFERENCES "ConsentPolicy"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScore" ADD CONSTRAINT "AssessmentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskIndicator" ADD CONSTRAINT "RiskIndicator_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationAttempt" ADD CONSTRAINT "EscalationAttempt_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAlert" ADD CONSTRAINT "CaseAlert_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAlert" ADD CONSTRAINT "CaseAlert_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
