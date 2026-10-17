-- CreateTable
CREATE TABLE `plan_categories` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color` VARCHAR(20) NOT NULL,
    `position` DOUBLE NOT NULL DEFAULT 0,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `plan_categories_user_id_position_idx`(`user_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_activities` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `category_id` CHAR(36) NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `start_minute` SMALLINT NOT NULL,
    `end_minute` SMALLINT NOT NULL,
    `repeat_days` TINYINT NOT NULL DEFAULT 0,
    `routine_type` VARCHAR(10) NOT NULL DEFAULT 'fixed',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `plan_activities_user_id_start_date_idx`(`user_id`, `start_date`),
    INDEX `plan_activities_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_activity_exceptions` (
    `id` CHAR(36) NOT NULL,
    `activity_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `cancelled` BOOLEAN NOT NULL DEFAULT false,
    `start_minute` SMALLINT NULL,
    `end_minute` SMALLINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `plan_activity_exceptions_activity_id_date_key`(`activity_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `focus_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `activity_id` CHAR(36) NULL,
    `title` VARCHAR(200) NOT NULL,
    `date` DATE NOT NULL,
    `planned_minutes` SMALLINT NOT NULL,
    `focused_seconds` INTEGER NOT NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `started_at` DATETIME(3) NOT NULL,
    `ended_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `focus_sessions_user_id_date_idx`(`user_id`, `date`),
    INDEX `focus_sessions_activity_id_idx`(`activity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plan_categories` ADD CONSTRAINT `plan_categories_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `plan_activities` ADD CONSTRAINT `plan_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `plan_activities` ADD CONSTRAINT `plan_activities_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `plan_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `plan_activity_exceptions` ADD CONSTRAINT `plan_activity_exceptions_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `plan_activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `focus_sessions` ADD CONSTRAINT `focus_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `focus_sessions` ADD CONSTRAINT `focus_sessions_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `plan_activities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
