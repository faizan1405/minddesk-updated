-- AlterTable
ALTER TABLE `users` ADD COLUMN `display_name` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `user_settings` (
    `user_id` CHAR(36) NOT NULL,
    `data` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
