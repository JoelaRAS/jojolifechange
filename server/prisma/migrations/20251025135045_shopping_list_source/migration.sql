-- CreateEnum
CREATE TYPE "ShoppingListSource" AS ENUM ('AUTO', 'MANUAL');

-- AddColumn
ALTER TABLE "ShoppingListItem"
ADD COLUMN     "source" "ShoppingListSource" NOT NULL DEFAULT 'AUTO';
