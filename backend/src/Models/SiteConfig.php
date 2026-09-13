<?php
/**
 * 网站配置模型
 */

namespace App\Models;

class SiteConfig extends BaseModel
{
    protected string $table = 'site_config';
    
    /**
     * 根据配置键获取值
     */
    public function getValue(string $key): ?string
    {
        $config = $this->findBy('config_key', $key);
        return $config ? $config['config_value'] : null;
    }
    
    /**
     * 设置配置值
     */
    public function setValue(string $key, string $value): bool
    {
        $config = $this->findBy('config_key', $key);
        
        if ($config) {
            return $this->update($config['id'], [
                'config_value' => $value,
                'updated_at' => date('Y-m-d H:i:s')
            ]);
        } else {
            $this->create([
                'config_key' => $key,
                'config_value' => $value,
                'updated_at' => date('Y-m-d H:i:s')
            ]);
            return true;
        }
    }
    
    /**
     * 获取所有公开配置（正式版本，前台使用）
     */
    public function getPublicConfig(): array
    {
        $configs = $this->all('id', 'ASC');
        $result = [];

        foreach ($configs as $config) {
            $result[$config['config_key']] = $config['config_value'];
        }

        return $result;
    }

    // ==================== 首页文案草稿 ====================

    /**
     * 获取所有草稿配置，返回 [key => value]
     */
    public function getDraftValues(): array
    {
        $stmt = $this->db->query("SELECT config_key, config_value FROM site_config_drafts");
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[$row['config_key']] = $row['config_value'];
        }
        return $result;
    }

    /**
     * 草稿条目列表（后台管理用）
     */
    public function getDrafts(): array
    {
        $stmt = $this->db->query(
            "SELECT d.config_key, d.config_value, d.updated_at,
                    p.config_value AS published_value
             FROM site_config_drafts d
             LEFT JOIN site_config p ON p.config_key = d.config_key
             ORDER BY d.config_key ASC"
        );
        return $stmt->fetchAll();
    }

    /**
     * 暂存草稿（不影响正式配置）
     */
    public function saveDraft(string $key, string $value): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO site_config_drafts (config_key, config_value, updated_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()"
        );
        $stmt->execute([$key, $value]);
    }

    /**
     * 批量暂存草稿
     */
    public function saveDrafts(array $configs): void
    {
        foreach ($configs as $key => $value) {
            $this->saveDraft((string)$key, (string)$value);
        }
    }

    /**
     * 发布草稿：把草稿值写入正式表，然后清空草稿
     *
     * @param array|null $keys 指定发布的键；null 表示发布全部草稿
     * @return int 发布条目数
     */
    public function publishDrafts(?array $keys = null): int
    {
        $drafts = $this->getDraftValues();
        $count = 0;

        foreach ($drafts as $key => $value) {
            if ($keys !== null && !in_array($key, $keys, true)) {
                continue;
            }
            $this->setValue($key, $value);
            $this->deleteDraft($key);
            $count++;
        }

        return $count;
    }

    /**
     * 放弃草稿（删除草稿行，正式配置不变）
     *
     * @param array|null $keys null 表示放弃全部
     */
    public function discardDrafts(?array $keys = null): int
    {
        if ($keys === null) {
            $count = $this->countDrafts();
            $this->db->exec("DELETE FROM site_config_drafts");
            return $count;
        }

        $count = 0;
        foreach ($keys as $key) {
            $count += $this->deleteDraft((string)$key) ? 1 : 0;
        }
        return $count;
    }

    public function deleteDraft(string $key): bool
    {
        $stmt = $this->db->prepare("DELETE FROM site_config_drafts WHERE config_key = ?");
        $stmt->execute([$key]);
        return $stmt->rowCount() > 0;
    }

    public function countDrafts(): int
    {
        $stmt = $this->db->query("SELECT COUNT(*) AS cnt FROM site_config_drafts");
        return (int)$stmt->fetch()['cnt'];
    }

    /**
     * 合并预览配置：正式值 + 草稿覆盖（预览接口使用）
     */
    public function getMergedConfig(): array
    {
        return array_merge($this->getPublicConfig(), $this->getDraftValues());
    }
}
