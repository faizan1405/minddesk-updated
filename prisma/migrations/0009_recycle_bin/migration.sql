-- AlterTable
ALTER TABLE `task_lists` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `tasks` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `projects` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `pages` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `events` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `mind_maps` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `routines` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `habits` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `task_lists_user_id_deleted_at_idx` ON `task_lists`(`user_id`, `deleted_at`);
CREATE INDEX `tasks_user_id_deleted_at_idx` ON `tasks`(`user_id`, `deleted_at`);
CREATE INDEX `projects_user_id_deleted_at_idx` ON `projects`(`user_id`, `deleted_at`);
CREATE INDEX `pages_user_id_deleted_at_idx` ON `pages`(`user_id`, `deleted_at`);
CREATE INDEX `events_user_id_deleted_at_idx` ON `events`(`user_id`, `deleted_at`);
CREATE INDEX `mind_maps_user_id_deleted_at_idx` ON `mind_maps`(`user_id`, `deleted_at`);
CREATE INDEX `routines_user_id_deleted_at_idx` ON `routines`(`user_id`, `deleted_at`);
CREATE INDEX `habits_user_id_deleted_at_idx` ON `habits`(`user_id`, `deleted_at`);
