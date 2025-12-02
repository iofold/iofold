-- iofold Test Data SQL
-- Generated at 2025-12-02T09:25:04.255Z
-- Run with: npx wrangler d1 execute iofold_validation --local --file=scripts/seed-data.sql

-- Generated Evals and Executions

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_7a1bd3e11a3041d1', 'agent_ab82584a-908b-430e-882a-fc06d9556c9c', 1, 'Customer Support Agent Quality Check v1', 'Evaluates response quality for Customer Support Agent', 'def eval_customer_support_agent_v1(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.79, '["trace_43c9af80-4088-4039-8196-00ff00e497fd","trace_13923f73-aecc-44c5-a7fa-e6a5db3c7a5a","trace_e7db0309-ba80-4464-bc81-f0f26f7a5959","trace_77650c84-0936-4418-bf54-16ca94638a0e"]', 'draft', datetime('now', '-2 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1bf3b1dc7b944805', 'eval_7a1bd3e11a3041d1', 'trace_43c9af80-4088-4039-8196-00ff00e497fd', 1, 'Response meets quality criteria', 120, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ea5633cef49643d5', 'eval_7a1bd3e11a3041d1', 'trace_13923f73-aecc-44c5-a7fa-e6a5db3c7a5a', 1, 'Response meets quality criteria', 451, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ce2de515fa3149bc', 'eval_7a1bd3e11a3041d1', 'trace_e7db0309-ba80-4464-bc81-f0f26f7a5959', 1, 'Response meets quality criteria', 406, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_9e085eeb4c0c4a9a', 'eval_7a1bd3e11a3041d1', 'trace_77650c84-0936-4418-bf54-16ca94638a0e', 1, 'Response meets quality criteria', 487, datetime('now', '-4 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_891efc7b914e4077', 'agent_ab82584a-908b-430e-882a-fc06d9556c9c', 2, 'Customer Support Agent Quality Check v2', 'Evaluates response quality for Customer Support Agent', 'def eval_customer_support_agent_v2(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.76, '["trace_43c9af80-4088-4039-8196-00ff00e497fd","trace_13923f73-aecc-44c5-a7fa-e6a5db3c7a5a","trace_e7db0309-ba80-4464-bc81-f0f26f7a5959","trace_77650c84-0936-4418-bf54-16ca94638a0e"]', 'active', datetime('now', '-2 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_21c5d0c174fc4a26', 'eval_891efc7b914e4077', 'trace_43c9af80-4088-4039-8196-00ff00e497fd', 0, 'Response did not meet criteria', 225, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c156535f9f30431e', 'eval_891efc7b914e4077', 'trace_13923f73-aecc-44c5-a7fa-e6a5db3c7a5a', 0, 'Response did not meet criteria', 327, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_dede91aad61645b0', 'eval_891efc7b914e4077', 'trace_e7db0309-ba80-4464-bc81-f0f26f7a5959', 0, 'Response did not meet criteria', 390, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1552e03d45f54faa', 'eval_891efc7b914e4077', 'trace_77650c84-0936-4418-bf54-16ca94638a0e', 1, 'Response meets quality criteria', 371, datetime('now', '-5 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_86b51a9b1d3a4751', 'agent_970bf269-aafe-4e8f-be7a-68e021fe7aaf', 1, 'Code Review Assistant Quality Check v1', 'Evaluates response quality for Code Review Assistant', 'def eval_code_review_assistant_v1(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.77, '["trace_c3368aa8-a14a-43bc-9536-3728d853aea7","trace_237aaf2f-80c7-4568-a3a2-3a94acf4a4a9","trace_a7c71b89-3480-41c8-93de-4a840f0cc00f","trace_e565ebcd-8605-4dc9-bb80-4e388b75765e"]', 'draft', datetime('now', '-8 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_a9e3cb1846cd4227', 'eval_86b51a9b1d3a4751', 'trace_c3368aa8-a14a-43bc-9536-3728d853aea7', 0, 'Response did not meet criteria', 115, datetime('now', '-2 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_efc2849c415f4cd1', 'eval_86b51a9b1d3a4751', 'trace_237aaf2f-80c7-4568-a3a2-3a94acf4a4a9', 1, 'Response meets quality criteria', 425, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_a979bbc6eda84910', 'eval_86b51a9b1d3a4751', 'trace_a7c71b89-3480-41c8-93de-4a840f0cc00f', 0, 'Response did not meet criteria', 199, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_988992d8c26b47a4', 'eval_86b51a9b1d3a4751', 'trace_e565ebcd-8605-4dc9-bb80-4e388b75765e', 1, 'Response meets quality criteria', 349, datetime('now', '-1 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_a5e4438f64a344b3', 'agent_970bf269-aafe-4e8f-be7a-68e021fe7aaf', 2, 'Code Review Assistant Quality Check v2', 'Evaluates response quality for Code Review Assistant', 'def eval_code_review_assistant_v2(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.84, '["trace_c3368aa8-a14a-43bc-9536-3728d853aea7","trace_237aaf2f-80c7-4568-a3a2-3a94acf4a4a9","trace_a7c71b89-3480-41c8-93de-4a840f0cc00f","trace_e565ebcd-8605-4dc9-bb80-4e388b75765e"]', 'active', datetime('now', '-9 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_43f966d3ae8e4fb1', 'eval_a5e4438f64a344b3', 'trace_c3368aa8-a14a-43bc-9536-3728d853aea7', 1, 'Response meets quality criteria', 53, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_3a09f0b1a08342e2', 'eval_a5e4438f64a344b3', 'trace_237aaf2f-80c7-4568-a3a2-3a94acf4a4a9', 0, 'Response did not meet criteria', 113, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_126488b10e1b4d88', 'eval_a5e4438f64a344b3', 'trace_a7c71b89-3480-41c8-93de-4a840f0cc00f', 0, 'Response did not meet criteria', 146, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_7e8a1864a74c4094', 'eval_a5e4438f64a344b3', 'trace_e565ebcd-8605-4dc9-bb80-4e388b75765e', 1, 'Response meets quality criteria', 462, datetime('now', '-1 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_d3b941e776c6405c', 'agent_5733feaf-c0cd-4d3c-878a-13b82c95428d', 1, 'Writing Assistant Quality Check v1', 'Evaluates response quality for Writing Assistant', 'def eval_writing_assistant_v1(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.75, '["trace_96ffee5a-0946-45e2-82bd-a9a96c19efb7","trace_e160ac54-a5d6-4f0b-bb1a-d1a7652a31c9","trace_ffedd090-78be-4865-b3ca-9a9e834dedee","trace_3c632b4a-2377-4b99-b5eb-a0e95355b94f"]', 'draft', datetime('now', '-6 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_6599be41068d4d74', 'eval_d3b941e776c6405c', 'trace_96ffee5a-0946-45e2-82bd-a9a96c19efb7', 1, 'Response meets quality criteria', 463, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_ea2d2aac7b224ca0', 'eval_d3b941e776c6405c', 'trace_e160ac54-a5d6-4f0b-bb1a-d1a7652a31c9', 1, 'Response meets quality criteria', 223, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_bf1660beb2e84486', 'eval_d3b941e776c6405c', 'trace_ffedd090-78be-4865-b3ca-9a9e834dedee', 0, 'Response did not meet criteria', 239, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_3aafb8c3682842b6', 'eval_d3b941e776c6405c', 'trace_3c632b4a-2377-4b99-b5eb-a0e95355b94f', 1, 'Response meets quality criteria', 119, datetime('now', '-6 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_97a1634cd2584e99', 'agent_5733feaf-c0cd-4d3c-878a-13b82c95428d', 2, 'Writing Assistant Quality Check v2', 'Evaluates response quality for Writing Assistant', 'def eval_writing_assistant_v2(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.74, '["trace_96ffee5a-0946-45e2-82bd-a9a96c19efb7","trace_e160ac54-a5d6-4f0b-bb1a-d1a7652a31c9","trace_ffedd090-78be-4865-b3ca-9a9e834dedee","trace_3c632b4a-2377-4b99-b5eb-a0e95355b94f"]', 'active', datetime('now', '-10 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_34827ea88e9f4330', 'eval_97a1634cd2584e99', 'trace_96ffee5a-0946-45e2-82bd-a9a96c19efb7', 1, 'Response meets quality criteria', 258, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_79758d4d38fa49c5', 'eval_97a1634cd2584e99', 'trace_e160ac54-a5d6-4f0b-bb1a-d1a7652a31c9', 1, 'Response meets quality criteria', 78, datetime('now', '-1 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_5e1d9d7661f2475b', 'eval_97a1634cd2584e99', 'trace_ffedd090-78be-4865-b3ca-9a9e834dedee', 0, 'Response did not meet criteria', 455, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_593c871857a44d69', 'eval_97a1634cd2584e99', 'trace_3c632b4a-2377-4b99-b5eb-a0e95355b94f', 1, 'Response meets quality criteria', 259, datetime('now', '-2 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_4d86f5e878f14dab', 'agent_5b234d13-3175-4cbe-9974-727c94590764', 1, 'Data Analysis Agent Quality Check v1', 'Evaluates response quality for Data Analysis Agent', 'def eval_data_analysis_agent_v1(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.75, '["trace_a1bc7a07-0260-4595-8945-445c4bdd60a1","trace_aca4cd1f-fe45-42a1-a8d6-8e26d49c9a89","trace_a27b559b-6991-4e28-a412-fa6f75abfbd5","trace_0ec61d7a-c40e-4f05-b57f-df36eb9a8bfe"]', 'draft', datetime('now', '-11 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_9eb606492fe543ae', 'eval_4d86f5e878f14dab', 'trace_a1bc7a07-0260-4595-8945-445c4bdd60a1', 1, 'Response meets quality criteria', 379, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_fc0b492a176f4fd4', 'eval_4d86f5e878f14dab', 'trace_aca4cd1f-fe45-42a1-a8d6-8e26d49c9a89', 1, 'Response meets quality criteria', 343, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_c809a7723848405c', 'eval_4d86f5e878f14dab', 'trace_a27b559b-6991-4e28-a412-fa6f75abfbd5', 1, 'Response meets quality criteria', 98, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_08bed976b55f4b03', 'eval_4d86f5e878f14dab', 'trace_0ec61d7a-c40e-4f05-b57f-df36eb9a8bfe', 0, 'Response did not meet criteria', 241, datetime('now', '-5 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_7e8aec2f14094cde', 'agent_5b234d13-3175-4cbe-9974-727c94590764', 2, 'Data Analysis Agent Quality Check v2', 'Evaluates response quality for Data Analysis Agent', 'def eval_data_analysis_agent_v2(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.9, '["trace_a1bc7a07-0260-4595-8945-445c4bdd60a1","trace_aca4cd1f-fe45-42a1-a8d6-8e26d49c9a89","trace_a27b559b-6991-4e28-a412-fa6f75abfbd5","trace_0ec61d7a-c40e-4f05-b57f-df36eb9a8bfe"]', 'active', datetime('now', '-9 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1d71b2ae9ee041e6', 'eval_7e8aec2f14094cde', 'trace_a1bc7a07-0260-4595-8945-445c4bdd60a1', 1, 'Response meets quality criteria', 405, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_2a22a947c40b43f5', 'eval_7e8aec2f14094cde', 'trace_aca4cd1f-fe45-42a1-a8d6-8e26d49c9a89', 1, 'Response meets quality criteria', 238, datetime('now', '-0 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_b16fffe0e7384117', 'eval_7e8aec2f14094cde', 'trace_a27b559b-6991-4e28-a412-fa6f75abfbd5', 1, 'Response meets quality criteria', 100, datetime('now', '-5 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_86fa537bc1754bfc', 'eval_7e8aec2f14094cde', 'trace_0ec61d7a-c40e-4f05-b57f-df36eb9a8bfe', 1, 'Response meets quality criteria', 330, datetime('now', '-2 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_304db1a59777426d', 'agent_aa770ea5-7fd1-483f-8a91-f83fd76076a6', 1, 'Research Assistant Quality Check v1', 'Evaluates response quality for Research Assistant', 'def eval_research_assistant_v1(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.76, '["trace_74d09385-0e9c-4a7c-86dd-ff9b6c4daecf","trace_2f2aac4a-4e14-4e60-9867-eaa4d118fb15","trace_6677a8c0-30fa-4ead-a733-62865cf54a49","trace_3e57b17c-ef0f-42d9-9b70-98ec1e0c7cc3"]', 'draft', datetime('now', '-7 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_69d7ed15b42844a1', 'eval_304db1a59777426d', 'trace_74d09385-0e9c-4a7c-86dd-ff9b6c4daecf', 1, 'Response meets quality criteria', 195, datetime('now', '-7 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_753b31680eec4266', 'eval_304db1a59777426d', 'trace_2f2aac4a-4e14-4e60-9867-eaa4d118fb15', 1, 'Response meets quality criteria', 306, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_88deeb7510f14320', 'eval_304db1a59777426d', 'trace_6677a8c0-30fa-4ead-a733-62865cf54a49', 0, 'Response did not meet criteria', 112, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_166658211f9e4acb', 'eval_304db1a59777426d', 'trace_3e57b17c-ef0f-42d9-9b70-98ec1e0c7cc3', 1, 'Response meets quality criteria', 398, datetime('now', '-5 days'));

INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('eval_c30dd75f29a043d3', 'agent_aa770ea5-7fd1-483f-8a91-f83fd76076a6', 2, 'Research Assistant Quality Check v2', 'Evaluates response quality for Research Assistant', 'def eval_research_assistant_v2(trace: dict) -> tuple[bool, str]:
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
', 'gpt-4', 0.95, '["trace_74d09385-0e9c-4a7c-86dd-ff9b6c4daecf","trace_2f2aac4a-4e14-4e60-9867-eaa4d118fb15","trace_6677a8c0-30fa-4ead-a733-62865cf54a49","trace_3e57b17c-ef0f-42d9-9b70-98ec1e0c7cc3"]', 'active', datetime('now', '-11 days'), datetime('now'));

INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_1a50fdaceab04406', 'eval_c30dd75f29a043d3', 'trace_74d09385-0e9c-4a7c-86dd-ff9b6c4daecf', 0, 'Response did not meet criteria', 429, datetime('now', '-4 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_73d19bbff1804d02', 'eval_c30dd75f29a043d3', 'trace_2f2aac4a-4e14-4e60-9867-eaa4d118fb15', 0, 'Response did not meet criteria', 294, datetime('now', '-3 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_be477bf060584eee', 'eval_c30dd75f29a043d3', 'trace_6677a8c0-30fa-4ead-a733-62865cf54a49', 1, 'Response meets quality criteria', 229, datetime('now', '-6 days'));
INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('exec_e548bc8f78684d07', 'eval_c30dd75f29a043d3', 'trace_3e57b17c-ef0f-42d9-9b70-98ec1e0c7cc3', 0, 'Response did not meet criteria', 141, datetime('now', '-5 days'));


-- Generated Jobs

INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_cfd035c48b4f47c6', 'workspace_default', 'prompt_evaluation', 'running', 93, '{"batch_size":97}', NULL, NULL, datetime('now', '-8 days'), datetime('now', '-1 days', '+16 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_b6b0214559dd4715', 'workspace_default', 'prompt_improvement', 'running', 65, '{"batch_size":32}', NULL, NULL, datetime('now', '-14 days'), datetime('now', '-7 days', '+55 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_2a99429c984e4932', 'workspace_default', 'generate', 'completed', 100, '{"batch_size":77}', '{"processed":134,"success":true}', NULL, datetime('now', '-18 days'), datetime('now', '-9 days', '+20 minutes'), datetime('now', '-8 days', '+89 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_5d30a240f5c24e13', 'workspace_default', 'execute', 'completed', 100, '{"batch_size":98}', '{"processed":142,"success":true}', NULL, datetime('now', '-20 days'), datetime('now', '-1 days', '+57 minutes'), datetime('now', '-0 days', '+93 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_687084caef364b41', 'workspace_default', 'generate', 'failed', 39, '{"batch_size":93}', NULL, 'Simulated error for testing', datetime('now', '-12 days'), datetime('now', '-0 days', '+58 minutes'), datetime('now', '-13 days', '+10 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_f98f3e1dd7f440e4', 'workspace_default', 'execute', 'failed', 77, '{"batch_size":69}', NULL, 'Simulated error for testing', datetime('now', '-13 days'), datetime('now', '-1 days', '+46 minutes'), datetime('now', '-14 days', '+98 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_499f1c0fa848402a', 'workspace_default', 'execute', 'completed', 100, '{"batch_size":65}', '{"processed":136,"success":true}', NULL, datetime('now', '-27 days'), datetime('now', '-20 days', '+22 minutes'), datetime('now', '-3 days', '+6 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_a3962348f72c4c1e', 'workspace_default', 'generate', 'completed', 100, '{"batch_size":54}', '{"processed":149,"success":true}', NULL, datetime('now', '-8 days'), datetime('now', '-20 days', '+49 minutes'), datetime('now', '-14 days', '+66 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_800881ffcd2b4d4d', 'workspace_default', 'import', 'queued', 97, '{"batch_size":56,"integration_id":"int_placeholder","filters":{"limit":183}}', NULL, NULL, datetime('now', '-27 days'), datetime('now', '-26 days', '+24 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_e28743c4e2f24874', 'workspace_default', 'agent_discovery', 'completed', 100, '{"batch_size":68}', '{"processed":122,"success":true}', NULL, datetime('now', '-2 days'), datetime('now', '-14 days', '+47 minutes'), datetime('now', '-0 days', '+119 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_eef8ac11dcaa489e', 'workspace_default', 'import', 'running', 10, '{"batch_size":30,"integration_id":"int_placeholder","filters":{"limit":117}}', NULL, NULL, datetime('now', '-19 days'), datetime('now', '-20 days', '+35 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_9db47a3e99bb4825', 'workspace_default', 'execute', 'completed', 100, '{"batch_size":95}', '{"processed":127,"success":true}', NULL, datetime('now', '-2 days'), datetime('now', '-13 days', '+54 minutes'), datetime('now', '-26 days', '+37 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_fdf56c54ef3a497b', 'workspace_default', 'generate', 'failed', 37, '{"batch_size":81}', NULL, 'Simulated error for testing', datetime('now', '-18 days'), datetime('now', '-2 days', '+30 minutes'), datetime('now', '-1 days', '+95 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_e1d3eab4c1b449d3', 'workspace_default', 'generate', 'queued', 40, '{"batch_size":22}', NULL, NULL, datetime('now', '-0 days'), datetime('now', '-19 days', '+13 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_ea97dc1aecc0430f', 'workspace_default', 'import', 'completed', 100, '{"batch_size":60,"integration_id":"int_placeholder","filters":{"limit":145}}', '{"processed":92,"success":true}', NULL, datetime('now', '-16 days'), datetime('now', '-4 days', '+37 minutes'), datetime('now', '-8 days', '+26 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_70f202fdcee44f64', 'workspace_default', 'prompt_evaluation', 'completed', 100, '{"batch_size":57}', '{"processed":56,"success":true}', NULL, datetime('now', '-14 days'), datetime('now', '-12 days', '+58 minutes'), datetime('now', '-5 days', '+115 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_ba8927ffb7914603', 'workspace_default', 'prompt_evaluation', 'running', 87, '{"batch_size":73}', NULL, NULL, datetime('now', '-21 days'), datetime('now', '-28 days', '+57 minutes'), NULL);
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_1d90763692114c0b', 'workspace_default', 'agent_discovery', 'completed', 100, '{"batch_size":46}', '{"processed":84,"success":true}', NULL, datetime('now', '-27 days'), datetime('now', '-27 days', '+1 minutes'), datetime('now', '-28 days', '+4 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_6b32cc6415aa4c74', 'workspace_default', 'import', 'completed', 100, '{"batch_size":69,"integration_id":"int_placeholder","filters":{"limit":52}}', '{"processed":148,"success":true}', NULL, datetime('now', '-3 days'), datetime('now', '-13 days', '+26 minutes'), datetime('now', '-15 days', '+94 minutes'));
INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('job_4075f01e35d94147', 'workspace_default', 'generate', 'completed', 100, '{"batch_size":22}', '{"processed":200,"success":true}', NULL, datetime('now', '-8 days'), datetime('now', '-8 days', '+20 minutes'), datetime('now', '-12 days', '+53 minutes'));

