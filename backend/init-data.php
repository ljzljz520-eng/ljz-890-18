<?php
/**
 * 数据初始化脚本
 * 在应用启动时自动修复admin密码
 */

require_once __DIR__ . '/src/Config/Database.php';
require_once __DIR__ . '/src/Utils/Logger.php';

use App\Config\Database;
use App\Utils\Logger;

$logger = Logger::getInstance();
$logger->info("Running data initializer...");

try {
    $db = Database::getInstance();
    
    // 检查 admin 用户是否存在
    $stmt = $db->prepare("SELECT id, username, password FROM admins WHERE username = ?");
    $stmt->execute(['admin']);
    $admin = $stmt->fetch();
    
    // 正确的密码 123456
    $correctPassword = '123456';
    
    if ($admin) {
        // 检查密码是否匹配
        if (!password_verify($correctPassword, $admin['password'])) {
            // 密码不匹配，重新生成正确的哈希
            $newHash = password_hash($correctPassword, PASSWORD_BCRYPT);
            
            $updateStmt = $db->prepare("UPDATE admins SET password = ? WHERE id = ?");
            $updateStmt->execute([$newHash, $admin['id']]);
            
            $logger->info("Admin password has been fixed successfully");
            echo "✅ Admin password fixed: admin / 123456\n";
        } else {
            $logger->info("Admin password is already correct");
            echo "✅ Admin password is correct\n";
        }
    } else {
        // admin用户不存在，创建新用户
        $newHash = password_hash($correctPassword, PASSWORD_BCRYPT);
        
        $insertStmt = $db->prepare("INSERT INTO admins (username, password, nickname, created_at) VALUES (?, ?, ?, NOW())");
        $insertStmt->execute(['admin', $newHash, '系统管理员']);
        
        $logger->info("Admin user created successfully");
        echo "✅ Admin user created: admin / 123456\n";
    }
    
    // ---- 草稿/发布功能：幂等数据库结构迁移 ----
    migrateSchema($db, $logger);

} catch (Exception $e) {
    $logger->error("Data initializer failed: " . $e->getMessage());
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}

echo "✅ Data initialization completed\n";

/**
 * 幂等迁移：为已存在的数据库补充草稿/发布相关字段与表
 */
function migrateSchema(PDO $db, $logger): void
{
    // life_events / photos 需要补充的字段
    $contentTables = [
        'life_events' => [
            'status'       => "ALTER TABLE life_events ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：0-草稿，1-已发布' AFTER sort_order",
            'draft_data'   => "ALTER TABLE life_events ADD COLUMN draft_data TEXT NULL COMMENT '草稿暂存JSON' AFTER status",
            'has_draft'    => "ALTER TABLE life_events ADD COLUMN has_draft TINYINT NOT NULL DEFAULT 0 COMMENT '是否有草稿改动' AFTER draft_data",
            'published_at' => "ALTER TABLE life_events ADD COLUMN published_at DATETIME NULL COMMENT '发布时间' AFTER has_draft",
            'updated_at'   => "ALTER TABLE life_events ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at",
        ],
        'photos' => [
            'status'       => "ALTER TABLE photos ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：0-草稿，1-已发布' AFTER sort_order",
            'draft_data'   => "ALTER TABLE photos ADD COLUMN draft_data TEXT NULL COMMENT '草稿暂存JSON' AFTER status",
            'has_draft'    => "ALTER TABLE photos ADD COLUMN has_draft TINYINT NOT NULL DEFAULT 0 COMMENT '是否有草稿改动' AFTER draft_data",
            'published_at' => "ALTER TABLE photos ADD COLUMN published_at DATETIME NULL COMMENT '发布时间' AFTER has_draft",
            'updated_at'   => "ALTER TABLE photos ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at",
        ],
    ];

    foreach ($contentTables as $table => $columns) {
        foreach ($columns as $column => $ddl) {
            if (!columnExists($db, $table, $column)) {
                $db->exec($ddl);
                $logger->info("Migration: added {$table}.{$column}");
                echo "✅ 迁移：新增字段 {$table}.{$column}\n";
            }
        }
    }

    // 首页文案草稿表
    $db->exec("CREATE TABLE IF NOT EXISTS site_config_drafts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
        config_value TEXT COMMENT '草稿配置值',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '草稿更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='网站配置草稿表'");
    echo "✅ 迁移：site_config_drafts 表已就绪\n";
}

/**
 * 检查字段是否已存在
 */
function columnExists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare(
        "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
    );
    $stmt->execute([$table, $column]);
    return (int)$stmt->fetch()['cnt'] > 0;
}
