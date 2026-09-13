<?php
/**
 * 认证中间件
 */

namespace App\Middleware;

use App\Utils\JWT;
use App\Utils\Response;

class AuthMiddleware
{
    /**
     * 处理认证
     */
    public function handle(): void
    {
        $token = JWT::getTokenFromHeader();
        
        if (!$token) {
            http_response_code(401);
            echo json_encode(Response::error('未登录或登录已过期', 401), JSON_UNESCAPED_UNICODE);
            exit;
        }
        
        $payload = JWT::verify($token);

        if (!$payload) {
            http_response_code(401);
            echo json_encode(Response::error('Token无效或已过期', 401), JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 预览链接专用 token 不具备后台操作权限
        if (($payload['typ'] ?? null) === 'preview') {
            http_response_code(403);
            echo json_encode(Response::error('预览链接不能用于后台操作', 403), JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 将用户信息存储到全局变量
        $GLOBALS['currentUser'] = $payload;
    }
}
