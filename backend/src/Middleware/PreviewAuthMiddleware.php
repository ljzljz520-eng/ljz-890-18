<?php
/**
 * 预览鉴权中间件
 *
 * 允许两类令牌：
 * 1. 后台保存草稿时生成的预览 token（typ=preview，7天有效）
 * 2. 管理员登录 JWT
 * 无有效令牌则返回 403，防止草稿被公开访问或抓取。
 */

namespace App\Middleware;

use App\Utils\JWT;
use App\Utils\Response;

class PreviewAuthMiddleware
{
    public function handle(): void
    {
        $token = JWT::getTokenFromRequest();

        if (!$token) {
            http_response_code(403);
            echo json_encode(Response::error('预览链接无效或已过期，请在后台重新生成', 403), JSON_UNESCAPED_UNICODE);
            exit;
        }

        $payload = JWT::verify($token);

        if (!$payload) {
            http_response_code(403);
            echo json_encode(Response::error('预览链接无效或已过期，请在后台重新生成', 403), JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 仅接受预览专用 token（typ=preview）或管理员登录 token
        $typ = $payload['typ'] ?? null;
        if ($typ !== 'preview' && empty($payload['username'])) {
            http_response_code(403);
            echo json_encode(Response::error('链接无预览权限', 403), JSON_UNESCAPED_UNICODE);
            exit;
        }

        $GLOBALS['previewClaims'] = $payload;
    }
}
