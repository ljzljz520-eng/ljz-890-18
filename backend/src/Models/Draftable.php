<?php
/**
 * 草稿能力 Trait
 *
 * 草稿/已发布分离设计：
 * - 正式字段（title、content 等）始终保存"已发布版本"
 * - draft_data(JSON) 暂存尚未发布的修改
 * - status=0 表示从未发布（新草稿），公开接口一律不返回
 * - 发布时将 draft_data 合并回正式字段，并清空草稿
 *
 * 子类需声明：
 *   protected array $draftFields = ['字段1', '字段2', ...];
 */

namespace App\Models;

trait Draftable
{
    /**
     * 为行数据附加解析后的草稿与 effective_* 预览字段
     */
    protected function withEffective(array $row): array
    {
        $draft = empty($row['draft_data']) ? null : json_decode($row['draft_data'], true);
        $draft = is_array($draft) ? $draft : null;

        $row['draft'] = $draft;

        foreach ($this->draftFields as $field) {
            if ($draft !== null && array_key_exists($field, $draft)) {
                $row['effective_' . $field] = $draft[$field];
            } else {
                $row['effective_' . $field] = $row[$field] ?? null;
            }
        }

        return $row;
    }

    /**
     * 按ID获取含预览字段的记录
     */
    public function findEffective(int $id): ?array
    {
        $row = $this->find($id);
        return $row ? $this->withEffective($row) : null;
    }

    /**
     * 保存草稿（仅写 draft_data，不动正式字段，前台不受影响）
     */
    public function saveDraft(int $id, array $data): array
    {
        $payload = [];
        foreach ($this->draftFields as $field) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = $data[$field];
            }
        }

        $this->update($id, [
            'draft_data' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'has_draft' => 1,
            'updated_at' => date('Y-m-d H:i:s')
        ]);

        return $this->findEffective($id);
    }

    /**
     * 发布：把草稿合并进正式字段，status 置为已发布，清空草稿
     */
    public function publishDraft(int $id): array
    {
        $row = $this->find($id);
        if (!$row) {
            throw new \RuntimeException('记录不存在');
        }

        $update = [
            'status' => 1,
            'has_draft' => 0,
            'draft_data' => null,
            'published_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s')
        ];

        if (!empty($row['draft_data'])) {
            $draft = json_decode($row['draft_data'], true);
            if (is_array($draft)) {
                foreach ($this->draftFields as $field) {
                    if (array_key_exists($field, $draft)) {
                        $update[$field] = $draft[$field];
                    }
                }
            }
        }

        $this->update($id, $update);
        return $this->find($id);
    }

    /**
     * 放弃草稿（仅清除草稿改动，不影响已发布内容）
     */
    public function clearDraft(int $id): void
    {
        $this->update($id, [
            'has_draft' => 0,
            'draft_data' => null,
            'updated_at' => date('Y-m-d H:i:s')
        ]);
    }

    /**
     * 发布当前表中所有待发布草稿，返回发布条数
     */
    public function publishAllDrafts(): int
    {
        $stmt = $this->db->query(
            "SELECT * FROM {$this->table} WHERE has_draft = 1 ORDER BY id ASC"
        );
        $rows = $stmt->fetchAll();

        foreach ($rows as $row) {
            $this->publishDraft((int)$row['id']);
        }

        return count($rows);
    }

    /**
     * 是否存在草稿改动
     */
    public function hasAnyDraft(): bool
    {
        return $this->count('has_draft = 1') > 0;
    }
}
