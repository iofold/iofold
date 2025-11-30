-- iofold Test Data SQL
-- Generated at 2025-11-30T10:43:57.993Z
-- Run with: npx wrangler d1 execute iofold_validation --local --file=scripts/seed-data.sql

-- Generated Evals and Executions

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_49bf5b02c96742af', 'agent_c737ba5a-4d11-439d-a25b-2580bb78b923', 1, 'Customer Support Agent Quality Check v1', 'Evaluates response quality for Customer Support Agent', 'def eval_customer_support_agent_v1(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Customer Support Agent responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.79, '["trace_e2db2917-75c1-490b-8689-6f31016cfc7a","trace_0ace66f0-0ff9-469e-96ad-31e3905369e4","trace_915de05f-add1-46cd-b6a9-05c1a66b3c5e","trace_85e34af7-2710-4724-809b-a6be9dd1abd6","trace_c2473f39-55af-453a-9037-3e1011e67f8a","trace_2fb3a7a4-db2c-4dc9-b272-396198d86b36","trace_08c28677-1665-4f83-9a11-741f232365f6","trace_ed1a92f7-fa17-45a2-a0e4-492d67a43bda","trace_82a6ec8b-23ea-4197-977d-b3e3dc42fa91","trace_f7fbda16-def5-44da-9fcc-df66d71483b7"]', 'draft', datetime('now', '-11 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_a73b114567984495', 'eval_49bf5b02c96742af', 'trace_e2db2917-75c1-490b-8689-6f31016cfc7a', 1, 'Response meets quality criteria', 175, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_cad58e9ef1434837', 'eval_49bf5b02c96742af', 'trace_0ace66f0-0ff9-469e-96ad-31e3905369e4', 1, 'Response meets quality criteria', 417, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_85b8df0567f0441e', 'eval_49bf5b02c96742af', 'trace_915de05f-add1-46cd-b6a9-05c1a66b3c5e', 1, 'Response meets quality criteria', 204, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_06e12a4a273247f2', 'eval_49bf5b02c96742af', 'trace_85e34af7-2710-4724-809b-a6be9dd1abd6', 1, 'Response meets quality criteria', 340, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_723170ee3f8b4c7c', 'eval_49bf5b02c96742af', 'trace_c2473f39-55af-453a-9037-3e1011e67f8a', 1, 'Response meets quality criteria', 459, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c14f2691db30499a', 'eval_49bf5b02c96742af', 'trace_2fb3a7a4-db2c-4dc9-b272-396198d86b36', 1, 'Response meets quality criteria', 484, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_5106e94d2d674e23', 'eval_49bf5b02c96742af', 'trace_08c28677-1665-4f83-9a11-741f232365f6', 1, 'Response meets quality criteria', 329, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_eb703b3f8ef24d97', 'eval_49bf5b02c96742af', 'trace_ed1a92f7-fa17-45a2-a0e4-492d67a43bda', 0, 'Response did not meet criteria', 296, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_86a0c6af431d48c6', 'eval_49bf5b02c96742af', 'trace_82a6ec8b-23ea-4197-977d-b3e3dc42fa91', 1, 'Response meets quality criteria', 85, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e84422011f024f36', 'eval_49bf5b02c96742af', 'trace_f7fbda16-def5-44da-9fcc-df66d71483b7', 1, 'Response meets quality criteria', 250, datetime('now', '-1 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_fa215abf44d04369', 'agent_c737ba5a-4d11-439d-a25b-2580bb78b923', 2, 'Customer Support Agent Quality Check v2', 'Evaluates response quality for Customer Support Agent', 'def eval_customer_support_agent_v2(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Customer Support Agent responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.86, '["trace_e2db2917-75c1-490b-8689-6f31016cfc7a","trace_0ace66f0-0ff9-469e-96ad-31e3905369e4","trace_915de05f-add1-46cd-b6a9-05c1a66b3c5e","trace_85e34af7-2710-4724-809b-a6be9dd1abd6","trace_c2473f39-55af-453a-9037-3e1011e67f8a","trace_2fb3a7a4-db2c-4dc9-b272-396198d86b36","trace_08c28677-1665-4f83-9a11-741f232365f6","trace_ed1a92f7-fa17-45a2-a0e4-492d67a43bda","trace_82a6ec8b-23ea-4197-977d-b3e3dc42fa91","trace_f7fbda16-def5-44da-9fcc-df66d71483b7"]', 'active', datetime('now', '-4 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1c2c317a6bef4357', 'eval_fa215abf44d04369', 'trace_e2db2917-75c1-490b-8689-6f31016cfc7a', 0, 'Response did not meet criteria', 304, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_288082aa0abd4af9', 'eval_fa215abf44d04369', 'trace_0ace66f0-0ff9-469e-96ad-31e3905369e4', 1, 'Response meets quality criteria', 299, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_4447dbd1683447ab', 'eval_fa215abf44d04369', 'trace_915de05f-add1-46cd-b6a9-05c1a66b3c5e', 1, 'Response meets quality criteria', 143, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_6456c19b323c4a7e', 'eval_fa215abf44d04369', 'trace_85e34af7-2710-4724-809b-a6be9dd1abd6', 1, 'Response meets quality criteria', 419, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_0b70e41da90645f5', 'eval_fa215abf44d04369', 'trace_c2473f39-55af-453a-9037-3e1011e67f8a', 0, 'Response did not meet criteria', 144, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_b711edc3f78c4f69', 'eval_fa215abf44d04369', 'trace_2fb3a7a4-db2c-4dc9-b272-396198d86b36', 1, 'Response meets quality criteria', 251, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_a193d38a33594677', 'eval_fa215abf44d04369', 'trace_08c28677-1665-4f83-9a11-741f232365f6', 1, 'Response meets quality criteria', 230, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c1a4dede69bf4d9d', 'eval_fa215abf44d04369', 'trace_ed1a92f7-fa17-45a2-a0e4-492d67a43bda', 1, 'Response meets quality criteria', 109, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_5ce88f82162a450f', 'eval_fa215abf44d04369', 'trace_82a6ec8b-23ea-4197-977d-b3e3dc42fa91', 1, 'Response meets quality criteria', 170, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_178905afd47445fc', 'eval_fa215abf44d04369', 'trace_f7fbda16-def5-44da-9fcc-df66d71483b7', 1, 'Response meets quality criteria', 445, datetime('now', '-2 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_4051ba10f77841e2', 'agent_b690a266-e842-42f1-9df5-67dba9b9e3f5', 1, 'Code Review Assistant Quality Check v1', 'Evaluates response quality for Code Review Assistant', 'def eval_code_review_assistant_v1(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Code Review Assistant responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.75, '["trace_76af56aa-da89-4d78-8300-94ea5378d998","trace_908ba7fe-367d-4ef9-87d5-879cee94ba0b","trace_4c514c50-c567-4e50-8de3-88e42cb3dced","trace_1f36ac47-d407-4c32-988d-ebc6fa452071","trace_624bfc72-c4e8-427b-b6fd-cc85d7fd25c6","trace_4a6dfebf-364b-4eff-9f53-ef6926a7a828","trace_e171deca-095f-43b9-98d0-865d06177099","trace_f880da36-1010-4856-872a-a7c886efbd55","trace_92d27d9d-ca6e-402e-a86b-26a9718db40d","trace_83afba35-21bc-40e4-a3a9-ad84454253f1"]', 'draft', datetime('now', '-9 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_d053139b59254eba', 'eval_4051ba10f77841e2', 'trace_76af56aa-da89-4d78-8300-94ea5378d998', 0, 'Response did not meet criteria', 54, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_7cc59fa05e114dba', 'eval_4051ba10f77841e2', 'trace_908ba7fe-367d-4ef9-87d5-879cee94ba0b', 1, 'Response meets quality criteria', 314, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_18393a14982947e2', 'eval_4051ba10f77841e2', 'trace_4c514c50-c567-4e50-8de3-88e42cb3dced', 1, 'Response meets quality criteria', 217, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_fb17ec86acb442d0', 'eval_4051ba10f77841e2', 'trace_1f36ac47-d407-4c32-988d-ebc6fa452071', 1, 'Response meets quality criteria', 244, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_525757f1a18c4a90', 'eval_4051ba10f77841e2', 'trace_624bfc72-c4e8-427b-b6fd-cc85d7fd25c6', 0, 'Response did not meet criteria', 215, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e9f2099ed4834430', 'eval_4051ba10f77841e2', 'trace_4a6dfebf-364b-4eff-9f53-ef6926a7a828', 1, 'Response meets quality criteria', 406, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_aa49aa7094f1444d', 'eval_4051ba10f77841e2', 'trace_e171deca-095f-43b9-98d0-865d06177099', 1, 'Response meets quality criteria', 334, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_3fb3418e4b544d80', 'eval_4051ba10f77841e2', 'trace_f880da36-1010-4856-872a-a7c886efbd55', 1, 'Response meets quality criteria', 169, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_db65c013e98f4cab', 'eval_4051ba10f77841e2', 'trace_92d27d9d-ca6e-402e-a86b-26a9718db40d', 1, 'Response meets quality criteria', 463, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_10b6cc6f3a3846d5', 'eval_4051ba10f77841e2', 'trace_83afba35-21bc-40e4-a3a9-ad84454253f1', 1, 'Response meets quality criteria', 250, datetime('now', '-4 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_448d367c6da74b4e', 'agent_b690a266-e842-42f1-9df5-67dba9b9e3f5', 2, 'Code Review Assistant Quality Check v2', 'Evaluates response quality for Code Review Assistant', 'def eval_code_review_assistant_v2(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Code Review Assistant responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.86, '["trace_76af56aa-da89-4d78-8300-94ea5378d998","trace_908ba7fe-367d-4ef9-87d5-879cee94ba0b","trace_4c514c50-c567-4e50-8de3-88e42cb3dced","trace_1f36ac47-d407-4c32-988d-ebc6fa452071","trace_624bfc72-c4e8-427b-b6fd-cc85d7fd25c6","trace_4a6dfebf-364b-4eff-9f53-ef6926a7a828","trace_e171deca-095f-43b9-98d0-865d06177099","trace_f880da36-1010-4856-872a-a7c886efbd55","trace_92d27d9d-ca6e-402e-a86b-26a9718db40d","trace_83afba35-21bc-40e4-a3a9-ad84454253f1"]', 'active', datetime('now', '-5 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_9057bd7290284d16', 'eval_448d367c6da74b4e', 'trace_76af56aa-da89-4d78-8300-94ea5378d998', 1, 'Response meets quality criteria', 463, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_daabf56afb0641dd', 'eval_448d367c6da74b4e', 'trace_908ba7fe-367d-4ef9-87d5-879cee94ba0b', 1, 'Response meets quality criteria', 144, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ea420774e4b44e1e', 'eval_448d367c6da74b4e', 'trace_4c514c50-c567-4e50-8de3-88e42cb3dced', 0, 'Response did not meet criteria', 178, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_450fa0372de442a4', 'eval_448d367c6da74b4e', 'trace_1f36ac47-d407-4c32-988d-ebc6fa452071', 1, 'Response meets quality criteria', 319, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_da57050becdb4419', 'eval_448d367c6da74b4e', 'trace_624bfc72-c4e8-427b-b6fd-cc85d7fd25c6', 0, 'Response did not meet criteria', 360, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_31d1771e5aae467f', 'eval_448d367c6da74b4e', 'trace_4a6dfebf-364b-4eff-9f53-ef6926a7a828', 1, 'Response meets quality criteria', 223, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_98b3ce34b0a54dee', 'eval_448d367c6da74b4e', 'trace_e171deca-095f-43b9-98d0-865d06177099', 0, 'Response did not meet criteria', 474, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1e00d35b06df4de8', 'eval_448d367c6da74b4e', 'trace_f880da36-1010-4856-872a-a7c886efbd55', 1, 'Response meets quality criteria', 243, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_3548cbf32e1d43b2', 'eval_448d367c6da74b4e', 'trace_92d27d9d-ca6e-402e-a86b-26a9718db40d', 1, 'Response meets quality criteria', 81, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_0c5fc8a25362436a', 'eval_448d367c6da74b4e', 'trace_83afba35-21bc-40e4-a3a9-ad84454253f1', 1, 'Response meets quality criteria', 240, datetime('now', '-5 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_45987d46ab524c16', 'agent_33b7f622-bea7-4c39-82ab-3664ff363a8a', 1, 'Writing Assistant Quality Check v1', 'Evaluates response quality for Writing Assistant', 'def eval_writing_assistant_v1(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Writing Assistant responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.71, '["trace_4a98676a-cf3f-4f89-adac-15f42b7d7dfb","trace_5d678f9b-1b04-44ff-96f4-7ecff82449e6","trace_aba70add-2751-4e8d-b1ea-3b2463c75c2b","trace_c7f88016-54aa-4ecd-9438-8a5f0d2b6126","trace_27586e00-c779-45df-9d08-fe7b15844a2a","trace_1367bd94-ad7c-4900-b3db-4d22e53bfc3d","trace_c6e4f5ab-6e99-4bce-8105-85a3b07f7361","trace_654b5034-be92-4791-bcd2-b95c4226adae","trace_fc161ca2-c502-4aae-ab23-a1b85fa8f2d3","trace_ca5c7651-d300-4a1b-b89a-5db7f23138d2"]', 'draft', datetime('now', '-7 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_46988d9aee774064', 'eval_45987d46ab524c16', 'trace_4a98676a-cf3f-4f89-adac-15f42b7d7dfb', 1, 'Response meets quality criteria', 342, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_bc18ccb094ce431f', 'eval_45987d46ab524c16', 'trace_5d678f9b-1b04-44ff-96f4-7ecff82449e6', 1, 'Response meets quality criteria', 119, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_bc8ec7ee5aad4a66', 'eval_45987d46ab524c16', 'trace_aba70add-2751-4e8d-b1ea-3b2463c75c2b', 1, 'Response meets quality criteria', 389, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_f988fb767a644695', 'eval_45987d46ab524c16', 'trace_c7f88016-54aa-4ecd-9438-8a5f0d2b6126', 1, 'Response meets quality criteria', 399, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_6931dc7be02d4f25', 'eval_45987d46ab524c16', 'trace_27586e00-c779-45df-9d08-fe7b15844a2a', 1, 'Response meets quality criteria', 235, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_054a3bf8fb3746f9', 'eval_45987d46ab524c16', 'trace_1367bd94-ad7c-4900-b3db-4d22e53bfc3d', 1, 'Response meets quality criteria', 318, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_6c3355a1d5604579', 'eval_45987d46ab524c16', 'trace_c6e4f5ab-6e99-4bce-8105-85a3b07f7361', 0, 'Response did not meet criteria', 401, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_7fecc921b221419b', 'eval_45987d46ab524c16', 'trace_654b5034-be92-4791-bcd2-b95c4226adae', 1, 'Response meets quality criteria', 354, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_02a533fa3f7c4f44', 'eval_45987d46ab524c16', 'trace_fc161ca2-c502-4aae-ab23-a1b85fa8f2d3', 1, 'Response meets quality criteria', 93, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_b6cf21f16d1749a4', 'eval_45987d46ab524c16', 'trace_ca5c7651-d300-4a1b-b89a-5db7f23138d2', 1, 'Response meets quality criteria', 429, datetime('now', '-2 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_4ce2537216c94418', 'agent_33b7f622-bea7-4c39-82ab-3664ff363a8a', 2, 'Writing Assistant Quality Check v2', 'Evaluates response quality for Writing Assistant', 'def eval_writing_assistant_v2(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Writing Assistant responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.83, '["trace_4a98676a-cf3f-4f89-adac-15f42b7d7dfb","trace_5d678f9b-1b04-44ff-96f4-7ecff82449e6","trace_aba70add-2751-4e8d-b1ea-3b2463c75c2b","trace_c7f88016-54aa-4ecd-9438-8a5f0d2b6126","trace_27586e00-c779-45df-9d08-fe7b15844a2a","trace_1367bd94-ad7c-4900-b3db-4d22e53bfc3d","trace_c6e4f5ab-6e99-4bce-8105-85a3b07f7361","trace_654b5034-be92-4791-bcd2-b95c4226adae","trace_fc161ca2-c502-4aae-ab23-a1b85fa8f2d3","trace_ca5c7651-d300-4a1b-b89a-5db7f23138d2"]', 'active', datetime('now', '-13 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_747795f033ff4c3d', 'eval_4ce2537216c94418', 'trace_4a98676a-cf3f-4f89-adac-15f42b7d7dfb', 1, 'Response meets quality criteria', 328, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e3bf54e371464e19', 'eval_4ce2537216c94418', 'trace_5d678f9b-1b04-44ff-96f4-7ecff82449e6', 1, 'Response meets quality criteria', 292, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_aba6e491a8b8463a', 'eval_4ce2537216c94418', 'trace_aba70add-2751-4e8d-b1ea-3b2463c75c2b', 1, 'Response meets quality criteria', 344, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ca244bf7ada5407e', 'eval_4ce2537216c94418', 'trace_c7f88016-54aa-4ecd-9438-8a5f0d2b6126', 1, 'Response meets quality criteria', 455, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c4368df30eb6484a', 'eval_4ce2537216c94418', 'trace_27586e00-c779-45df-9d08-fe7b15844a2a', 0, 'Response did not meet criteria', 350, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_bc5d5f8c85644e63', 'eval_4ce2537216c94418', 'trace_1367bd94-ad7c-4900-b3db-4d22e53bfc3d', 1, 'Response meets quality criteria', 445, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_46973aff0621432f', 'eval_4ce2537216c94418', 'trace_c6e4f5ab-6e99-4bce-8105-85a3b07f7361', 1, 'Response meets quality criteria', 404, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ca2ee1206d3e4758', 'eval_4ce2537216c94418', 'trace_654b5034-be92-4791-bcd2-b95c4226adae', 1, 'Response meets quality criteria', 476, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c33b38257480472f', 'eval_4ce2537216c94418', 'trace_fc161ca2-c502-4aae-ab23-a1b85fa8f2d3', 1, 'Response meets quality criteria', 210, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_31347049fe6047a8', 'eval_4ce2537216c94418', 'trace_ca5c7651-d300-4a1b-b89a-5db7f23138d2', 1, 'Response meets quality criteria', 490, datetime('now', '-4 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_e88a35ad89a548c7', 'agent_48749891-f08a-49ee-ab94-c03c6124901c', 1, 'Data Analysis Agent Quality Check v1', 'Evaluates response quality for Data Analysis Agent', 'def eval_data_analysis_agent_v1(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Data Analysis Agent responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.8, '["trace_7aebb996-e98d-4a69-8dbf-bfd05b8a815a","trace_48ebd6f5-4f94-4e14-9f05-a557f8dfabab","trace_20e461c6-abba-4adb-892f-29c4cfb25733","trace_0d35dccb-fa2a-4334-8c0f-83234e93fcd6","trace_9ac2ebff-9cbb-4182-9354-6833075bd106","trace_fa7be92c-39a2-4347-94e7-1a013ec9132b","trace_f54e70a5-9fd5-4d14-953f-0f590d729584","trace_7a9e2da9-94c0-492f-ae74-848fb6d09c9b","trace_34bf0804-b3bd-407b-865b-c5f3d4e51000","trace_97d217c0-fea9-4e69-be3c-789d02432bbb"]', 'draft', datetime('now', '-2 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c6ecc0bb385d4ba7', 'eval_e88a35ad89a548c7', 'trace_7aebb996-e98d-4a69-8dbf-bfd05b8a815a', 1, 'Response meets quality criteria', 177, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e151bde64ea34d44', 'eval_e88a35ad89a548c7', 'trace_48ebd6f5-4f94-4e14-9f05-a557f8dfabab', 1, 'Response meets quality criteria', 240, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e6f884b578e8428e', 'eval_e88a35ad89a548c7', 'trace_20e461c6-abba-4adb-892f-29c4cfb25733', 1, 'Response meets quality criteria', 193, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_d2c62c74527c4ba3', 'eval_e88a35ad89a548c7', 'trace_0d35dccb-fa2a-4334-8c0f-83234e93fcd6', 1, 'Response meets quality criteria', 95, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_3fcd33ed50164082', 'eval_e88a35ad89a548c7', 'trace_9ac2ebff-9cbb-4182-9354-6833075bd106', 0, 'Response did not meet criteria', 141, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e52be02825b04499', 'eval_e88a35ad89a548c7', 'trace_fa7be92c-39a2-4347-94e7-1a013ec9132b', 0, 'Response did not meet criteria', 468, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ac9374a544874387', 'eval_e88a35ad89a548c7', 'trace_f54e70a5-9fd5-4d14-953f-0f590d729584', 1, 'Response meets quality criteria', 207, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_db613a3054414974', 'eval_e88a35ad89a548c7', 'trace_7a9e2da9-94c0-492f-ae74-848fb6d09c9b', 1, 'Response meets quality criteria', 359, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_d16a4797b1e3419f', 'eval_e88a35ad89a548c7', 'trace_34bf0804-b3bd-407b-865b-c5f3d4e51000', 1, 'Response meets quality criteria', 354, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_a254b9dba2c34f65', 'eval_e88a35ad89a548c7', 'trace_97d217c0-fea9-4e69-be3c-789d02432bbb', 1, 'Response meets quality criteria', 176, datetime('now', '-4 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_20c0dd42c202495a', 'agent_48749891-f08a-49ee-ab94-c03c6124901c', 2, 'Data Analysis Agent Quality Check v2', 'Evaluates response quality for Data Analysis Agent', 'def eval_data_analysis_agent_v2(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Data Analysis Agent responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.72, '["trace_7aebb996-e98d-4a69-8dbf-bfd05b8a815a","trace_48ebd6f5-4f94-4e14-9f05-a557f8dfabab","trace_20e461c6-abba-4adb-892f-29c4cfb25733","trace_0d35dccb-fa2a-4334-8c0f-83234e93fcd6","trace_9ac2ebff-9cbb-4182-9354-6833075bd106","trace_fa7be92c-39a2-4347-94e7-1a013ec9132b","trace_f54e70a5-9fd5-4d14-953f-0f590d729584","trace_7a9e2da9-94c0-492f-ae74-848fb6d09c9b","trace_34bf0804-b3bd-407b-865b-c5f3d4e51000","trace_97d217c0-fea9-4e69-be3c-789d02432bbb"]', 'active', datetime('now', '-4 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_3de01b97b00e47f3', 'eval_20c0dd42c202495a', 'trace_7aebb996-e98d-4a69-8dbf-bfd05b8a815a', 0, 'Response did not meet criteria', 394, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_59cc2d79a04b4934', 'eval_20c0dd42c202495a', 'trace_48ebd6f5-4f94-4e14-9f05-a557f8dfabab', 1, 'Response meets quality criteria', 352, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_eb8a08925f2b45e3', 'eval_20c0dd42c202495a', 'trace_20e461c6-abba-4adb-892f-29c4cfb25733', 1, 'Response meets quality criteria', 282, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_8e730765b79841ef', 'eval_20c0dd42c202495a', 'trace_0d35dccb-fa2a-4334-8c0f-83234e93fcd6', 1, 'Response meets quality criteria', 473, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_362356d63537480f', 'eval_20c0dd42c202495a', 'trace_9ac2ebff-9cbb-4182-9354-6833075bd106', 1, 'Response meets quality criteria', 154, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_dea26f0b473f4f43', 'eval_20c0dd42c202495a', 'trace_fa7be92c-39a2-4347-94e7-1a013ec9132b', 0, 'Response did not meet criteria', 175, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_876694d1b4eb4955', 'eval_20c0dd42c202495a', 'trace_f54e70a5-9fd5-4d14-953f-0f590d729584', 1, 'Response meets quality criteria', 85, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ce2a560fef0f42a7', 'eval_20c0dd42c202495a', 'trace_7a9e2da9-94c0-492f-ae74-848fb6d09c9b', 1, 'Response meets quality criteria', 290, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_990371819f1e4de6', 'eval_20c0dd42c202495a', 'trace_34bf0804-b3bd-407b-865b-c5f3d4e51000', 1, 'Response meets quality criteria', 498, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_8ca9efb223bb44d3', 'eval_20c0dd42c202495a', 'trace_97d217c0-fea9-4e69-be3c-789d02432bbb', 1, 'Response meets quality criteria', 229, datetime('now', '-7 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_6c6d3e7c10c5462b', 'agent_3bb6cb45-2595-4ed1-9b11-d170c27e53d3', 1, 'Research Assistant Quality Check v1', 'Evaluates response quality for Research Assistant', 'def eval_research_assistant_v1(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Research Assistant responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.8, '["trace_f75b13bf-e187-45c3-b997-ef09235c2909","trace_d121f418-a98e-447f-8931-9417f9947dd4","trace_406290b3-2c81-4f88-bf2c-d1fe35ba820e","trace_02ca1e02-011b-4d54-9ddb-dca6974ee39b","trace_86c383ff-848a-4a65-8b1f-6ae35265ec4e","trace_5bda7458-bb9f-4ce9-a664-d4ac09bd3796","trace_4dfc59b5-3c08-4f6c-885a-31a4cfec22c4","trace_5fec7a1b-ea5c-4b63-96d9-cefccf7ffbd6","trace_bbcf5509-1bed-41cc-b860-59d348457e17","trace_489384ac-1c68-41bb-808a-295bb7fa3514"]', 'draft', datetime('now', '-7 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_9c329686b2e647ad', 'eval_6c6d3e7c10c5462b', 'trace_f75b13bf-e187-45c3-b997-ef09235c2909', 1, 'Response meets quality criteria', 257, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_a38b42a010004007', 'eval_6c6d3e7c10c5462b', 'trace_d121f418-a98e-447f-8931-9417f9947dd4', 1, 'Response meets quality criteria', 182, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_473169dad11641cf', 'eval_6c6d3e7c10c5462b', 'trace_406290b3-2c81-4f88-bf2c-d1fe35ba820e', 1, 'Response meets quality criteria', 402, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_594e078bb6ae4456', 'eval_6c6d3e7c10c5462b', 'trace_02ca1e02-011b-4d54-9ddb-dca6974ee39b', 1, 'Response meets quality criteria', 333, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_8c2bfbaf214a4a86', 'eval_6c6d3e7c10c5462b', 'trace_86c383ff-848a-4a65-8b1f-6ae35265ec4e', 1, 'Response meets quality criteria', 431, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_051b43c2cec4488f', 'eval_6c6d3e7c10c5462b', 'trace_5bda7458-bb9f-4ce9-a664-d4ac09bd3796', 1, 'Response meets quality criteria', 467, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_391d9040c3044f1d', 'eval_6c6d3e7c10c5462b', 'trace_4dfc59b5-3c08-4f6c-885a-31a4cfec22c4', 1, 'Response meets quality criteria', 423, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_0065143f60ec4ae8', 'eval_6c6d3e7c10c5462b', 'trace_5fec7a1b-ea5c-4b63-96d9-cefccf7ffbd6', 1, 'Response meets quality criteria', 147, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_7e092873626b4559', 'eval_6c6d3e7c10c5462b', 'trace_bbcf5509-1bed-41cc-b860-59d348457e17', 1, 'Response meets quality criteria', 422, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_64dc9864bc004d2c', 'eval_6c6d3e7c10c5462b', 'trace_489384ac-1c68-41bb-808a-295bb7fa3514', 1, 'Response meets quality criteria', 81, datetime('now', '-4 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_32538f87ddd14f76', 'agent_3bb6cb45-2595-4ed1-9b11-d170c27e53d3', 2, 'Research Assistant Quality Check v2', 'Evaluates response quality for Research Assistant', 'def eval_research_assistant_v2(trace: dict) -> tuple[bool, str]:
    """
    Evaluate Research Assistant responses.
    Generated automatically from training examples.
    """
    output = trace.get(''output'', {}).get(''response'', '''')

    # Check for quality indicators
    quality_indicators = [''understand'', ''help'', ''solution'', ''recommend'']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = [''cannot'', ''error'', ''unable'', ''sorry'']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, ''Response demonstrates quality indicators''
    elif has_negative:
        return False, ''Response contains negative patterns''
    else:
        return len(output) > 100, ''Based on response length''
', 'gpt-4', 0.72, '["trace_f75b13bf-e187-45c3-b997-ef09235c2909","trace_d121f418-a98e-447f-8931-9417f9947dd4","trace_406290b3-2c81-4f88-bf2c-d1fe35ba820e","trace_02ca1e02-011b-4d54-9ddb-dca6974ee39b","trace_86c383ff-848a-4a65-8b1f-6ae35265ec4e","trace_5bda7458-bb9f-4ce9-a664-d4ac09bd3796","trace_4dfc59b5-3c08-4f6c-885a-31a4cfec22c4","trace_5fec7a1b-ea5c-4b63-96d9-cefccf7ffbd6","trace_bbcf5509-1bed-41cc-b860-59d348457e17","trace_489384ac-1c68-41bb-808a-295bb7fa3514"]', 'active', datetime('now', '-8 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ab6ddc61cd6c441f', 'eval_32538f87ddd14f76', 'trace_f75b13bf-e187-45c3-b997-ef09235c2909', 0, 'Response did not meet criteria', 371, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1075ffab8f9d49e6', 'eval_32538f87ddd14f76', 'trace_d121f418-a98e-447f-8931-9417f9947dd4', 1, 'Response meets quality criteria', 98, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_4a18c1b6f9f6414c', 'eval_32538f87ddd14f76', 'trace_406290b3-2c81-4f88-bf2c-d1fe35ba820e', 1, 'Response meets quality criteria', 176, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_73c327458a634d3a', 'eval_32538f87ddd14f76', 'trace_02ca1e02-011b-4d54-9ddb-dca6974ee39b', 1, 'Response meets quality criteria', 132, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_9d24182528374b30', 'eval_32538f87ddd14f76', 'trace_86c383ff-848a-4a65-8b1f-6ae35265ec4e', 1, 'Response meets quality criteria', 297, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_6db44b8a804b49b4', 'eval_32538f87ddd14f76', 'trace_5bda7458-bb9f-4ce9-a664-d4ac09bd3796', 1, 'Response meets quality criteria', 287, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_8274c1cf294f407e', 'eval_32538f87ddd14f76', 'trace_4dfc59b5-3c08-4f6c-885a-31a4cfec22c4', 1, 'Response meets quality criteria', 279, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_50a8d77555584bba', 'eval_32538f87ddd14f76', 'trace_5fec7a1b-ea5c-4b63-96d9-cefccf7ffbd6', 0, 'Response did not meet criteria', 312, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_4a84bee20c194f14', 'eval_32538f87ddd14f76', 'trace_bbcf5509-1bed-41cc-b860-59d348457e17', 0, 'Response did not meet criteria', 85, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_b7012cd556034621', 'eval_32538f87ddd14f76', 'trace_489384ac-1c68-41bb-808a-295bb7fa3514', 0, 'Response did not meet criteria', 427, datetime('now', '-4 days'));


-- Generated Jobs

INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_d69b32627d4b40e1', 'workspace_default', 'generate', 'completed', 100, '{"batch_size":12}', '{"processed":107,"success":true}', NULL, datetime('now', '-16 days'), datetime('now', '-14 days', '+18 minutes'), datetime('now', '-25 days', '+81 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_570a2ddf64594425', 'workspace_default', 'generate', 'queued', 97, '{"batch_size":38}', NULL, NULL, datetime('now', '-14 days'), datetime('now', '-10 days', '+5 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_bafb7c07be034df5', 'workspace_default', 'prompt_evaluation', 'queued', 32, '{"batch_size":36}', NULL, NULL, datetime('now', '-22 days'), datetime('now', '-8 days', '+46 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_bb00e5370ac9423f', 'workspace_default', 'generate', 'completed', 100, '{"batch_size":12}', '{"processed":174,"success":true}', NULL, datetime('now', '-16 days'), datetime('now', '-27 days', '+50 minutes'), datetime('now', '-2 days', '+116 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_50707cf709d34f0d', 'workspace_default', 'prompt_evaluation', 'running', 92, '{"batch_size":21}', NULL, NULL, datetime('now', '-23 days'), datetime('now', '-11 days', '+34 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_77993d4eb1d848ed', 'workspace_default', 'prompt_improvement', 'failed', 14, '{"batch_size":18}', NULL, 'Simulated error for testing', datetime('now', '-3 days'), datetime('now', '-4 days', '+19 minutes'), datetime('now', '-22 days', '+73 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_4db5a5dd58014f5e', 'workspace_default', 'execute', 'running', 98, '{"batch_size":100}', NULL, NULL, datetime('now', '-15 days'), datetime('now', '-26 days', '+45 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_82e58df7a4744ba0', 'workspace_default', 'execute', 'completed', 100, '{"batch_size":57}', '{"processed":191,"success":true}', NULL, datetime('now', '-24 days'), datetime('now', '-23 days', '+37 minutes'), datetime('now', '-8 days', '+19 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_1267228935784cd0', 'workspace_default', 'prompt_evaluation', 'completed', 100, '{"batch_size":100}', '{"processed":182,"success":true}', NULL, datetime('now', '-26 days'), datetime('now', '-9 days', '+33 minutes'), datetime('now', '-28 days', '+42 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_9dccbad3d98f451a', 'workspace_default', 'generate', 'running', 35, '{"batch_size":84}', NULL, NULL, datetime('now', '-26 days'), datetime('now', '-26 days', '+48 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_818593baef78478f', 'workspace_default', 'execute', 'queued', 39, '{"batch_size":11}', NULL, NULL, datetime('now', '-25 days'), datetime('now', '-30 days', '+45 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_12492f6dc6d04e12', 'workspace_default', 'prompt_evaluation', 'running', 54, '{"batch_size":48}', NULL, NULL, datetime('now', '-5 days'), datetime('now', '-14 days', '+31 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_2f1f0e25af0a44f7', 'workspace_default', 'prompt_improvement', 'failed', 76, '{"batch_size":89}', NULL, 'Simulated error for testing', datetime('now', '-11 days'), datetime('now', '-2 days', '+19 minutes'), datetime('now', '-7 days', '+116 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_7e19cc1a9f71488d', 'workspace_default', 'prompt_evaluation', 'completed', 100, '{"batch_size":72}', '{"processed":100,"success":true}', NULL, datetime('now', '-25 days'), datetime('now', '-9 days', '+58 minutes'), datetime('now', '-1 days', '+24 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_fdd5707da64c4547', 'workspace_default', 'prompt_improvement', 'running', 19, '{"batch_size":67}', NULL, NULL, datetime('now', '-0 days'), datetime('now', '-24 days', '+43 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_f9cabde1ee0e4983', 'workspace_default', 'execute', 'completed', 100, '{"batch_size":35}', '{"processed":107,"success":true}', NULL, datetime('now', '-28 days'), datetime('now', '-22 days', '+34 minutes'), datetime('now', '-13 days', '+18 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_4cea95e517574306', 'workspace_default', 'execute', 'completed', 100, '{"batch_size":22}', '{"processed":114,"success":true}', NULL, datetime('now', '-26 days'), datetime('now', '-10 days', '+48 minutes'), datetime('now', '-25 days', '+72 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_798e138b76c94249', 'workspace_default', 'import', 'failed', 27, '{"batch_size":88,"integration_id":"int_placeholder","filters":{"limit":137}}', NULL, 'Simulated error for testing', datetime('now', '-28 days'), datetime('now', '-30 days', '+53 minutes'), datetime('now', '-6 days', '+115 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_1a5c0ba8b23a447b', 'workspace_default', 'prompt_improvement', 'running', 85, '{"batch_size":43}', NULL, NULL, datetime('now', '-18 days'), datetime('now', '-25 days', '+42 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_3059153a0bce4ecc', 'workspace_default', 'import', 'failed', 71, '{"batch_size":91,"integration_id":"int_placeholder","filters":{"limit":55}}', NULL, 'Simulated error for testing', datetime('now', '-25 days'), datetime('now', '-22 days', '+14 minutes'), datetime('now', '-12 days', '+90 minutes'));

