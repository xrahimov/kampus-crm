-- Someone who both teaches and runs things picks which side of Kampus to look at (A-194).
-- Null until the person uses the switch: they then see everything, as before.
CREATE TYPE "StaffView" AS ENUM ('TEACHING', 'FULL');
ALTER TABLE "User" ADD COLUMN "staffView" "StaffView";
