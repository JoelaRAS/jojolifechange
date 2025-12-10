-- CreateTable
CREATE TABLE "DailyStep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'google_fit',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 10000,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyStep_userId_date_key" ON "DailyStep"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StepGoal_userId_key" ON "StepGoal"("userId");

-- AddForeignKey
ALTER TABLE "DailyStep" ADD CONSTRAINT "DailyStep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepGoal" ADD CONSTRAINT "StepGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
